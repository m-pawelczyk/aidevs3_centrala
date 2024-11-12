import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import fs from 'fs/promises';
import path from 'path';

const openai = new OpenAI();

async function readMapsAsBase64(): Promise<string[]> {
    const mapsDir = path.join(__dirname, 'maps');
    const files = await fs.readdir(mapsDir);
    
    const base64Images = await Promise.all(
        files.map(async (file) => {
            const filePath = path.join(mapsDir, file);
            const buffer = await fs.readFile(filePath);
            return buffer.toString('base64');
        })
    );
    
    return base64Images;
}

async function transformToImageUrlObjects(base64Strings: string[]) : Promise<any[]>{
    return base64Strings.map(imageBase64 => ({
        type: "image_url",
        image_url: {
            url: `data:image/jpeg;base64,${imageBase64}`,
            detail: "high"
        }
    }));
};

async function askGptVision(visionMessage: any[]) : Promise<OpenAI.Chat.Completions.ChatCompletion> {
    const systemMessage = `Jesteś detektywem, który specjalizuje się w rozwiązywaniu skomplikowanych 
    zagadek związanych z mapami. Od użytkownika otrzymasz 4 fragmenty map. Jeden fragment pochodzi 
    z innego miasta. To pomyłka, ktora ma Cię zmylić. Zignoruj fragment, który nie pasuje do reszty.
    
    Twoim zadaniem jest przeanalizować te fragmenty map i odpowiedzieć na pytanie, z którego miasta 
    pochodzą 3 fragmenty map.
    
    Wskazówka: W tym mieście znajdują się spichlerze i twierdze. 

    Sprawdz dokładnie topografię kadego z fragmentów. Przyjrzyj się szczegółom mapy i sprawdź czy 
    pasują do znanej Ci topografii miasta. Pamiętaj, że trzy fragmenty i wskazówka "spichlerze i twierdze" muszą pasować do nazwy miasta którą podasz. 

    Przyjrzyj się jeszcze raz przed udzieleniem odpowiedzi
    
    Odpowiedz nazwą miasta i uzasadnieniem dlaczego jest to odpowiedź na zagadkę. Omów kazdy z trzech fragmentów, który pasuje do wybranego miasta`
    const userMessage = {
                type: "text",
                text: "Jakie miasto w Polsce przedstawiają trzy fragmenty?"
            }
    visionMessage.push(userMessage)

    const messages: ChatCompletionMessageParam[] = [
        {
            role: "system",
            content: systemMessage
        },
        {
            role: "user",
            content: visionMessage
        }
    ];
    
    try {
        const chatCompletion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: messages,
            max_tokens: 1024,
            response_format: { type: "text" }
        });
        
        return chatCompletion as OpenAI.Chat.Completions.ChatCompletion;
    } catch (error) {
        console.error("Error in OpenAI completion:", error);
        throw error;
    }
}

async function main() {
    const maps = await readMapsAsBase64();
    const jsonMessagesWithImages = await transformToImageUrlObjects(maps);
    const visionResponse = await askGptVision(jsonMessagesWithImages);
    
    console.log(visionResponse.choices[0].message.content);
}

main().catch(console.error);
