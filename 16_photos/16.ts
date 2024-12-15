import * as fs from 'fs';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import * as path from 'path';
import { send_answer3 } from "../modules/tasks";

const openai = new OpenAI();

function askGpt(systemMsg: string, question: string): Promise<string> {    
    const messages: ChatCompletionMessageParam[] = [
        {
            role: "system",
            content: systemMsg
        },
        {
            role: "user",
            content: question
        }
    ];
    
    return openai.chat.completions.create({
        model: "gpt-4o",
        messages: messages,
        max_tokens: 16384,
        response_format: { type: "json_object" }
    }).then(completion => completion.choices[0].message.content || '')
    .catch(error => {
        console.error("Error in OpenAI completion:", error);
        throw error;
    });
}

async function askGptVisionByURL(imageURL: string, question: string) : Promise<OpenAI.Chat.Completions.ChatCompletion> {
    try {
        const chatCompletion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: question },
                  {
                    type: "image_url",
                    image_url: {
                      "url": imageURL,
                    },
                  },
                ],
              },
            ],
            max_tokens: 1024,
            response_format: { type: "text" }
          });
        
        return chatCompletion as OpenAI.Chat.Completions.ChatCompletion;
    } catch (error) {
        console.error("Error in OpenAI completion:", error);
        throw error;
    }
}

interface PhotoEntry {
    _thinking: string;
    fileName: string;
    filePath: string;
    action: string;
    message: string;
    quality: string;
}

interface PhotosInput {
    [key: string]: PhotoEntry;
}

interface DescriptionOutput {
    [key: string]: string;
}

interface TaskResponse {
    message: string;
    [key: string]: unknown;
}

async function processPhotos(input: PhotosInput): Promise<DescriptionOutput> {
    const result: DescriptionOutput = {};
    
    for (const [_, entry] of Object.entries(input)) {
        if (entry.action === "DESCRIBE") {
            try {
                const description = await askGptVisionByURL(entry.filePath, entry.message);
                if (description.choices && description.choices[0]?.message?.content) {
                    result[entry.filePath] = description.choices[0].message.content;
                }
            } catch (error) {
                console.error(`Error processing ${entry.fileName}:`, error);
                result[entry.filePath] = `Error: Failed to process image`;
            }
        }
    }
    
    return result;
}

async function main() {
    // Get URL from environment variable and validate
    const url = process.env.CENTRALA_URL;
    const taskKey = process.env.TASKS_API_KEY;

    if (!url || !taskKey) {
        return Promise.reject(new Error('Environment variables are not set'));
    }

    const systemMsg = `Jesteś specjalistą od budowania rysopisow osób. Twoim zadaniem jest stworzenie rysopisu zaginionej osoby, której szukamy. Niestety pliki, które otrzymamy mogą być slabej jakości lub nie przedstawiać osób możliwych do opisania. Masz jednak do wyboru kilka narzędzi, którymi możesz się posłużyć w celu poprawy jakości pliku oraz jegio opisu. Jeśli otrzymany opis nie pozwala na skorzystanie z pliku zignoruj go. Nie jesteśmy wtedy w stanie naprawić uszkodzenia.

W wiadomociach użytkownika możesz znaleźć nazwy plików a także ich lokalizację.

Masz 4 narzędzia, które możesz wykorzystać i poprosić użytkownika o wykonanie dla Ciebie operacji, które umieszczasz w polu "action":

DESCRIBE - Wykona dla Ciebie opis przy pomocy modelu Vision. Możesz go wykorzystać by dowiedzieć się co jest na zdjęciu. Dodaj wtedy w polu "message" wiadomość dla modelu Vision by opisał dla Ciebie to co chcesz wiedzieć.

REPAIR - Możesz użyć do usunięcia szumów i glitchy i naprawić zdjęcie. 

DARKEN - Przyciemnia zdjęcie.

BRIGHTEN - Rozjaśnia zdjęcie.

W polu "quality" umieść informację jakiej jakości i jak przydatny jest ten plik do wykonania rysopisu:

INIT - Nic nie wiem o tym zdjęciu.

BAD - Zła jakość i wymaga poprawy pliku przy pomocy narzędzi "REPAIR", "DARKEN", "BRIGHTEN".

NOT_UNDERSTAND - Wiadomość użytkownika nie jest zrozumiała. Nie zawiera pliku ani innej sensownej informacji.

PORTRAIT - Plik gotowy do wykonania rysopisu. Jest w dobrej jakości. 

NOT_A_PORTRAIT - Na zdjęciu na pewno nie widać twarzy i nie nadaje się do wykonania rysopisu.

Swoją odpowiedź zwroć obiekt JSON jak ponizej. Dla kazdego podanego pliku stwórz osobny wpis w tablicy. 

<response_format>
{
    Nazwa pliku: {
        "_thinking": Wyjaśnienie twojej decyzji i procesu rozumowania
        "fileName": Nazwa pliku
        "filePath": Adres, pod którym nalezy szukać pliku. Jeśli uzytkownik nie podał pełnego URL do pliku to doklej "https://centrala.ag3nts.org/dane/barbara/" przed nazw pliku
        "action": Akcja, która chcesz wykonać na pliku, opcje: "DESCRIBE" | "REPAIR" | "DARKEN" | "BRIGHTEN"
        "message": Wiadomość do modelu Vision jeśli uzywasz "DESCRIBE". Dla innych akcji zostaw puste. 
        "quality": Jakość przesłanego pliku, opcje "INIT", "BAD", "NOT_UNDERSTAND", "PORTRAIT"
    },
... obiekt opisujcy kolejny plik z wiadomości uytkownika
}  
</response_format>

<example>
U: "Mam pliki IMG_2.PNG Fotografia IMG_5.PNG jest wyblakła, nie wiem co się na niej znajduje. 

Pliki powinny być pod adresem http://abc.com/
"

A: [{
	"fileName": "IMG_2.PNG",
	"filePath": "http://abc.com/IMG_2.PNG",
	"action": "DESCRIBE"
	"message": Co znajduje się na tej fotografii. Zwróć uwagę czy jest to zdjęcia uszkodzone, za ciemne, za jasne. Czy widać na tym zdjęciu twarz osoby?
	"quality": "INIT"
},
{
	"fileName": "IMG_5.PNG",
	"filePath": "http://abc.com/IMG_5.PNG",
	"action": DARKEN"
	"quality": "BAD"
}]
</example>
`

    // const images = await send_answer3("photos", "START") as TaskResponse;
    // // console.log("IMAGES:", images);
    // // console.log("message:", images['message']);

    // const reply1 = await askGpt(systemMsg, images.message);
    // console.log("Reply:", reply1);

    // const reply2 = await processPhotos(JSON.parse(reply1))
    // console.log("Descriptions:", reply2);

    const descriptions = `
        IMG_559.PNG - Na tej fotografii występują wyraźne oznaki uszkodzenia, z wieloma zakłóceniami i zniekształceniami obrazu, co sprawia, że trudno określić, co dokładnie przedstawia. Efekt może być opisywany jako zbyt jasny lub rozmyty ze względu na rozrzucenie kolorów oraz poziome i pionowe linie. Twarz osoby nie jest wyraźnie widoczna, a szczegóły są zniekształcone.
        IMG_1410.PNG - Na zdjęciu widać dwa zamazane kontury postaci, jednak szczegóły są trudne do uchwycenia, ponieważ obraz jest bardzo ciemny. Nie można jednoznacznie stwierdzić, czy twarze osób są widoczne. Wygląda na to, że zdjęcie jest za ciemne, co utrudnia rozpoznanie szczegółów.
        IMG_1443.PNG - Na zdjęciu widoczne są wzory w formie fal oraz siatki w dwóch kolorach, czerwonym i niebieskim. Wygląda na to, że obraz jest zniekształcony i nieczytelny. Nie mogę stwierdzić, czy na zdjęciu jest widoczna twarz osoby, ponieważ obraz nie jest wystarczająco wyraźny.
        IMG_1444.PNG - Na fotografii widać osobę idącą ulicą w miejskim otoczeniu, trzymającą torbę. W tle znajdują się inni przechodnie oraz część zabudowy. Oświetlenie wydaje się być ciepłe i złote, co sugeruje, że może być to wczesny wieczór lub poranek. \n\nNie wydaje się, aby zdjęcie było uszkodzone, ale istnieje możliwość, że jest lekko za jasne w niektórych miejscach, co może powodować utratę detali. Twarz osoby jest nieczytelna, ponieważ jest skierowana od kamery.
    `
    const reply1 = await askGpt(systemMsg, descriptions);
    console.log("Reply:", reply1);


    // const reply2 = await askGptVisionByURL("    ", "Co znajduje się na tym obrazie? Czy jest to zdjęcie osoby? Jaka jest jego jakość i czy wymaga poprawek?");
    // console.log("Reply:", reply2);

    // const images = await send_answer3("photos", "REPAIR IMG_1443.PNG");
    // console.log("IMAGES:", images);

    // const reply1 = await askGpt(systemMsg, "IMG_1443.PNG: Zdjęcie przestawia wizerunek kobiety w okularach. Widać twarz. Zdjęcie jest dobrej jakości.");
    // console.log("Reply:", reply1);
}

main().catch(console.error);
