import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { NodeHtmlMarkdown, NodeHtmlMarkdownOptions } from 'node-html-markdown'
import path from 'path';
import { send_answer3 } from "../modules/tasks";
import * as pdfjsLib from 'pdfjs-dist'
import { TextItem, TextMarkedContent } from 'pdfjs-dist/types/src/display/api';
import { fromPath } from "pdf2pic";
import fs from 'fs/promises';
import { statSync } from 'fs';



const openai = new OpenAI();


async function readFactsContent(): Promise<string> {
    const factsDir = path.join(__dirname, 'facts');
    try {
        // Get list of files in facts directory
        const files = await fs.readdir(factsDir);
        
        // Read content of each file and combine them
        const contents = await Promise.all(
            files.map(async (file) => {
                const filePath = path.join(factsDir, file);
                const content = await fs.readFile(filePath, 'utf-8');
                return content;
            })
        );
        
        // Join all contents with newlines
        return contents.join('\n');
    } catch (error) {
        throw new Error('Failed to read facts directory: ' + (error as Error).message);
    }
}




interface TaskQuestions {
    "01": string;
    "02": string;
    "03": string;
    [key: string]: string;
}

async function getJson<T>(url: string): Promise<T> {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json() as T;
    } catch (error) {
        console.error('Error fetching data:', error);
        throw error;
    }
}

async function requestTaskQuestions(url: string): Promise<TaskQuestions> {
    return await getJson<TaskQuestions>(url);
}

async function identifyPersons(question: string): Promise<string> {   
    const facts = await readFactsContent();
    const systemMsg = `Twoim zadaniem jest ustalenie rozmowców w rozmowach telefonicznych, które otrzymasz od użytkownika jako obiekt JSON. Każda z rozmów jest prowadzone jedynie przez dwie osoby, ktore wypowiadają się w niej naprzemiemiennie. Osoby pomiędzy rozmowami mogą się powtarzać, ale imona identyfikują unikalne osoby. Witek w jednej rozmowie jest tym samym Witkiem w drugiej rozmowie.

W ustaleniu kto jest autorem, ktorej z wypowiedzi bardzo pomocne mogą być informacje Zawarte w kontekście. To są potwiedzone informacje znane wcześniej

<context>
${facts}
</context>

Zwróć odpowiedź jako obiekt JSON o tej samej strukturze jaką przekazał Ci użytkownik, ale zmień jedynie treś by można było łatwo odczytywać kt jest autorem każdego z dialogow. Zamień "-" przed każdą wypowiedzią  na imie osoby, która ją wypowiada w mianowniku. 

<example>
U: {
	rozmowa3: [ "- Samuelu! helooo?! Słyszysz mnie teraz? Zadzwoniłem ponownie, bo chyba znowu z zasięgiem jest u Ciebie jakiś problem...",
    "- tak Zygfryd, słyszę Cię teraz dobrze. Przepraszam, gdy poprzednio dzwoniłeś, byłem w fabryce. Wiesz, w sektorze D, gdzie się produkuje broń i tutaj mają jakąś izolację na ścianach dodatkową. Telefon gubi zasięg. Masz jakieś nowe zadanie dla mnie?",
    "- tak. Mam dla Ciebie nowe zadanie. Skontaktuj się z Tomaszem. On pracuje w Centrali. Może pomóc Ci włamać się do komputera tego gościa. Masz już endpoint API?",
    "- tak, mam ten endpoint. https://rafal.ag3nts.org/510bc - Dzięki. Zadzwonię do Tomasza dopytać o resztę. Coś jeszcze?",
    "- Nie, to wszysto. No to weź teraz ten endpoint i użyj do połączenia. Tomasz powie Ci jakie jest hasło do pierwszej warstwy zabezpieczeń. OK. Nie marnuj czasu. Dzwoń!",
    "- OK. Dzwonię do Tomasza. [*dźwięk odkładanej słuchawki*]"
  ]
}
A: {
	rozmowa3: [ "Zygfryd: Samuelu! helooo?! Słyszysz mnie teraz? Zadzwoniłem ponownie, bo chyba znowu z zasięgiem jest u Ciebie jakiś problem...",
    "Samuel: tak Zygfryd, słyszę Cię teraz dobrze. Przepraszam, gdy poprzednio dzwoniłeś, byłem w fabryce. Wiesz, w sektorze D, gdzie się produkuje broń i tutaj mają jakąś izolację na ścianach dodatkową. Telefon gubi zasięg. Masz jakieś nowe zadanie dla mnie?",
    "Zygfryd: tak. Mam dla Ciebie nowe zadanie. Skontaktuj się z Tomaszem. On pracuje w Centrali. Może pomóc Ci włamać się do komputera tego gościa. Masz już endpoint API?",
    "Samuel: tak, mam ten endpoint. https://rafal.ag3nts.org/510bc - Dzięki. Zadzwonię do Tomasza dopytać o resztę. Coś jeszcze?",
    "Zygfryd: Nie, to wszysto. No to weź teraz ten endpoint i użyj do połączenia. Tomasz powie Ci jakie jest hasło do pierwszej warstwy zabezpieczeń. OK. Nie marnuj czasu. Dzwoń!",
    "Samuel: OK. Dzwonię do Tomasza. [*dźwięk odkładanej słuchawki*]"
  ]
}
</example>

    `
    return askGpt(systemMsg, question)
}

async function identifyLiar(question: string): Promise<string> {   
    const facts = await readFactsContent();
    const systemMsg = `Twoim zadaniem jest ustalenie rozmowców w rozmowach telefonicznych, które otrzymasz od użytkownika jako obiekt JSON. Każda z rozmów jest prowadzone jedynie przez dwie osoby, ktore wypowiadają się w niej naprzemiemiennie. Osoby pomiędzy rozmowami mogą się powtarzać, ale imona identyfikują unikalne osoby. Witek w jednej rozmowie jest tym samym Witkiem w drugiej rozmowie.

W ustaleniu kto jest autorem, ktorej z wypowiedzi bardzo pomocne mogą być informacje Zawarte w kontekście. To są potwiedzone informacje znane wcześniej

<context>
${facts}
</context>

Zwróć odpowiedź jako obiekt JSON o tej samej strukturze jaką przekazał Ci użytkownik, ale zmień jedynie treś by można było łatwo odczytywać kt jest autorem każdego z dialogow. Zamień "-" przed każdą wypowiedzią  na imie osoby, która ją wypowiada w mianowniku. 

<example>
U: {
	rozmowa3: [ "- Samuelu! helooo?! Słyszysz mnie teraz? Zadzwoniłem ponownie, bo chyba znowu z zasięgiem jest u Ciebie jakiś problem...",
    "- tak Zygfryd, słyszę Cię teraz dobrze. Przepraszam, gdy poprzednio dzwoniłeś, byłem w fabryce. Wiesz, w sektorze D, gdzie się produkuje broń i tutaj mają jakąś izolację na ścianach dodatkową. Telefon gubi zasięg. Masz jakieś nowe zadanie dla mnie?",
    "- tak. Mam dla Ciebie nowe zadanie. Skontaktuj się z Tomaszem. On pracuje w Centrali. Może pomóc Ci włamać się do komputera tego gościa. Masz już endpoint API?",
    "- tak, mam ten endpoint. https://rafal.ag3nts.org/510bc - Dzięki. Zadzwonię do Tomasza dopytać o resztę. Coś jeszcze?",
    "- Nie, to wszysto. No to weź teraz ten endpoint i użyj do połączenia. Tomasz powie Ci jakie jest hasło do pierwszej warstwy zabezpieczeń. OK. Nie marnuj czasu. Dzwoń!",
    "- OK. Dzwonię do Tomasza. [*dźwięk odkładanej słuchawki*]"
  ]
}
A: {
	rozmowa3: [ "Zygfryd: Samuelu! helooo?! Słyszysz mnie teraz? Zadzwoniłem ponownie, bo chyba znowu z zasięgiem jest u Ciebie jakiś problem...",
    "Samuel: tak Zygfryd, słyszę Cię teraz dobrze. Przepraszam, gdy poprzednio dzwoniłeś, byłem w fabryce. Wiesz, w sektorze D, gdzie się produkuje broń i tutaj mają jakąś izolację na ścianach dodatkową. Telefon gubi zasięg. Masz jakieś nowe zadanie dla mnie?",
    "Zygfryd: tak. Mam dla Ciebie nowe zadanie. Skontaktuj się z Tomaszem. On pracuje w Centrali. Może pomóc Ci włamać się do komputera tego gościa. Masz już endpoint API?",
    "Samuel: tak, mam ten endpoint. https://rafal.ag3nts.org/510bc - Dzięki. Zadzwonię do Tomasza dopytać o resztę. Coś jeszcze?",
    "Zygfryd: Nie, to wszysto. No to weź teraz ten endpoint i użyj do połączenia. Tomasz powie Ci jakie jest hasło do pierwszej warstwy zabezpieczeń. OK. Nie marnuj czasu. Dzwoń!",
    "Samuel: OK. Dzwonię do Tomasza. [*dźwięk odkładanej słuchawki*]"
  ]
}
</example>

    `
    return askGpt(systemMsg, question)
}

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

async function readKnowledge<T>(filename: string): Promise<T> {
    const knowledgeDir = path.join(__dirname, 'knowledge');
    
    try {
        // Check if knowledge directory exists
        try {
            await fs.access(knowledgeDir);
        } catch {
            throw new Error('Knowledge directory does not exist');
        }
        
        // Ensure filename has .json extension
        const fullFilename = filename.endsWith('.json') ? filename : `${filename}.json`;
        const filePath = path.join(knowledgeDir, fullFilename);
        
        // Read and parse JSON from file
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content) as T;
    } catch (error) {
        throw new Error(`Failed to read knowledge: ${(error as Error).message}`);
    }
}

async function storeKnowledge(data: any, filename: string): Promise<void> {
    const knowledgeDir = path.join(__dirname, 'knowledge');
    
    try {
        // Check if knowledge directory exists, create if not
        try {
            await fs.access(knowledgeDir);
        } catch {
            await fs.mkdir(knowledgeDir, { recursive: true });
        }
        
        // Ensure filename has .json extension
        const fullFilename = filename.endsWith('.json') ? filename : `${filename}.json`;
        const filePath = path.join(knowledgeDir, fullFilename);
        
        // Write JSON to file
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
        throw new Error(`Failed to store knowledge: ${(error as Error).message}`);
    }
}

async function main() {
    const url = process.env.CENTRALA_URL;
    const taskKey = process.env.TASKS_API_KEY;

    if (!url || !taskKey) {
        return Promise.reject(new Error('Environment variables are not set'));
    }

    // const transcriptions = await requestTaskQuestions("https://centrala.ag3nts.org/data/" + taskKey + "/phone.json");
    // console.log("transcriptions:", transcriptions);    
    
    
    const questions = await requestTaskQuestions("https://centrala.ag3nts.org/data/" + taskKey + "/phone_questions.json");
    console.log("questions:", questions);
    const transcriptions = await requestTaskQuestions("https://centrala.ag3nts.org/data/" + taskKey + "/phone_sorted.json");
    console.log("transcriptions:", transcriptions);
    
    // const identified = await identifyPersons(JSON.stringify(transcriptions));
    // console.log("identified:", identified);
    // await storeKnowledge(JSON.parse(identified), "transcriptions");

    const transcriptionsJson = await readKnowledge("transcriptions");
    console.log("transcriptionsJson:", transcriptionsJson);

    // console.log("answers:", questions)

    // await send_answer3("notes", questions)
}

main().catch(console.error);
