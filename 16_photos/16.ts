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

function findFirstPortraitImage(data: PhotosInput): PhotoEntry | undefined {
    return Object.values(data).find(entry => entry.quality === "PORTRAIT");
}

async function processBadPhotos(data: string | PhotosInput): Promise<string> {
    // Parse JSON if string input
    const photoData: PhotosInput = typeof data === 'string' ? JSON.parse(data) : data;
    
    // Filter for BAD quality and map to [action, fileName]
    const badPhotos = Object.values(photoData)
        .filter(entry => entry.quality === "BAD")
        .map(async entry => {
            const response = await send_answer3("photos", entry.action + " " + entry.fileName) as TaskResponse;
            return response.message;
        });
    
    // Wait for all send_answer3 calls to complete and join results
    const results = await Promise.all(badPhotos);
    return results.join('\n');
}

async function processPhotos(input: PhotosInput): Promise<DescriptionOutput> {
    const result: DescriptionOutput = {};
    
    for (const [_, entry] of Object.entries(input)) {
        if (entry.action === "DESCRIBE") {
            try {
                const description = await askGptVisionByURL(entry.filePath, entry.message);
                if (description.choices && description.choices[0]?.message?.content) {
                    result[entry.fileName] = description.choices[0].message.content;
                }
            } catch (error) {
                console.error(`Error processing ${entry.fileName}:`, error);
                result[entry.filePath] = `Error: Failed to process image`;
            }
        }
    }
    
    return result;
}

function formatDescriptionOutput(output: DescriptionOutput): string {
    return Object.entries(output)
        .map(([key, value]) => `${key} - ${value}`)
        .join('\n');
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

    const initMessageWithImages = await send_answer3("photos", "START") as TaskResponse;
    console.log("IMAGES:", initMessageWithImages);

    let ready = false;
    let attempts = 0;
    let userinput = initMessageWithImages.message;
    let policemanReply;
    let visionReply;
    let simpleVisionReply;
    let robotReply;
    const maxAttempts = 5;
    let portrait;
    let portraits = []

    policemanReply = await askGpt(systemMsg, userinput);
    console.log("Policeman:", policemanReply);

    visionReply = await processPhotos(JSON.parse(policemanReply));
    console.log("Vision:", visionReply);

    simpleVisionReply = await formatDescriptionOutput(visionReply);
    console.log("Vision Simple:", simpleVisionReply);

    policemanReply = await askGpt(systemMsg, simpleVisionReply);
    console.log("Policeman 2:", policemanReply);
    
    robotReply = await processBadPhotos(policemanReply);
    console.log("Robot:", robotReply);

    policemanReply = await askGpt(systemMsg, robotReply);
    console.log("Policeman 3:", policemanReply);
    portrait = findFirstPortraitImage(JSON.parse(policemanReply))
    if (portrait !== undefined) {
        portraits.push(portrait)
    }
    visionReply = await processPhotos(JSON.parse(policemanReply));
    console.log("Vision:", visionReply);

    simpleVisionReply = await formatDescriptionOutput(visionReply);
    console.log("Vision Simple:", simpleVisionReply);

    policemanReply = await askGpt(systemMsg, simpleVisionReply);
    console.log("Policeman 4:", policemanReply);
    portrait = findFirstPortraitImage(JSON.parse(policemanReply))
    if (portrait !== undefined) {
        portraits.push(portrait)
    }

    if (portraits.length > 0) {
        const portraitDescription = await askGptVisionByURL(portraits[0].filePath, "Jesteś policyjnym rysownikiem. Wykonań profesjonalny rysopis osoby na zdjęciu. Podaj znaki szczególne: długość i kolor włosów, kształt twarzy");
        console.log("Rysopis:", portraitDescription.choices[0].message.content);
        const result = await send_answer3("photos", portraitDescription.choices[0].message.content)
        console.log("Result", result);
    }
}

main().catch(console.error);
