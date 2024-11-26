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

async function main() {
    // Get URL from environment variable and validate
    const url = process.env.CENTRALA_URL;
    const taskKey = process.env.TASKS_API_KEY;

    if (!url || !taskKey) {
        return Promise.reject(new Error('Environment variables are not set'));
    }

    const systemMsg = `Jesteś specjalistą od budowania rysopisow osób. Twoim zadaniem jest stworzenie rysopisu zaginionej osoby, której szukamy. Niestety pliki, które otrzymamy mogą być slabej jakości lub nie przedstawiać osób możliwych do opisania. Masz jednak do wyboru kilka narzędzi, którymi możesz się posłużyć w celu poprawy jakości pliku oraz jegio opisu. Jeśli otrzymany opis nie pozwala na skorzystanie z pliku zignoruj go. Nie jesteśmy wtedy w stanie naprawić uszkodzenia.

W wiadomociach użytkownika możesz znaleźć nazwy plikó a także ich lokalizację.

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

Swoją odpowiedź zwroć obiekt JSON jak ponizej. Dla kazdego podanego pliku stwórz osobny wpis w tablicy. 

<response_format>
{
    "fileName": {
        "_thinking": Wyjaśnienie twojej decyzji i procesu rozumowania
        "fileName": Nazwa pliku
        "filePath": Adres, pod którym nalezy szukać pliku. Jeśli uzytkownik nie podał zostaw pole puste
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
    


    // const images = await send_answer3("photos", "START");
    // console.log("IMAGES:", images);
    // console.log("message:", images['message']);

    // const reply1 = await askGpt(systemMsg, images['message'] as string);
    // console.log("Reply:", reply1);

    const images = await send_answer3("photos", "REPAIR IMG_1443.PNG");
    console.log("IMAGES:", images);

    const reply1 = await askGpt(systemMsg, "IMG_1443.PNG: Zdjęcie przestawia wizerunek kobiety w okularach. Widać twarz. Zdjęcie jest dobrej jakości.");
    console.log("Reply:", reply1);
}

main().catch(console.error);
