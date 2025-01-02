import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { NodeHtmlMarkdown, NodeHtmlMarkdownOptions } from 'node-html-markdown'
import path from 'path';
import { send_answer3 } from "../modules/tasks";
import * as pdfjsLib from 'pdfjs-dist'
import { TextItem, TextMarkedContent } from 'pdfjs-dist/types/src/display/api';
import { fromPath } from "pdf2pic";
import fs from 'fs/promises';
import { statSync, existsSync } from 'fs';



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
        if (!('ok' in response)) {
            throw new Error('Invalid response object');
        }
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data as T;
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
    const systemMsg = `Twoim zadaniem jest przeanalizowanie rozmów telefonicznych, które otrzymasz od użytkownika jako obiekt JSON. Jedna z tych osob kłamie. Musisz wskazać, która.

Zastanow się i myśl głośno. Użytkonik Cię nie słyszy w tej chwili.

W ustaleniu kto jest kłamcą, bardzo pomocne mogą być informacje zawarte w kontekście. To są potwiedzone informacje znane wcześniej.

<context>
${facts}
</context>

Zwróć odpowiedź jako obiekt JSON.

<response_structure>
{
	"_thinking": Wyjaśnij swoją decyzję i sposob rozumowania. To jest bardzo ważne by zneleźć kłamcę, ale nie możemy się tutaj pomylić.
	"name": Podaj imię kłamcy i nic więcej. 
}
</response_structure>

<example>
U: {
	rozmowa3: [ "Alek: Byłem wczoraj w sektorze C",
    "Zenon: O, to bardzo ciekawe. Co oni tam budują"
  ]
}
A: {
	"_thinking": "Alek kłamie. W faktach znalazłem, że nigdy nie byl w fabryce, więc nie mógł odwiedzić sektora C" 
	"name": "Alek"
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

async function verifyAnswerCorrect(aidevAPIResponse: any): Promise<string> {   
    if(aidevAPIResponse !== 0) {
        const systemMsg = `Twoim zadaniem jes pobranie z wiadomości uzytkonika numeru błędnej odpowiedzi i nic więcej. 

Zwróć odpowiedź jako obiekt JSON.

<response_structure>
{
	"number": Tu podaj liczbę wyjęt z wiadomości uwytkownika w tym samym formacie jakim ja przekazał. 
}
</response_structure>

<example>
U: "Answer for question 09 is incorrect"
A: {
	"number": "09"
}
</example>
    `
        return askGptMini(systemMsg, aidevAPIResponse.message)
    } else {
        return JSON.stringify({
            "number": "" 
        });
    }    
}

function askGptMini(systemMsg: string, question: string): Promise<string> {    
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
        model: "gpt-4o-mini",
        messages: messages,
        max_tokens: 1000,
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

function checkFileExists(filename: string): boolean {
    const knowledgeDir = path.join(__dirname, 'knowledge');
    const filePath = path.join(knowledgeDir, filename);
    return existsSync(filePath);
}

function agentInitState(questions: any, transcriptions: any): any {
    return {
        "questions": questions,
        "transcriptions": transcriptions,
        "hints": [],
        "notCorrectAnwers": [],
        "currentQuestion": "", 
        "stateAnswers": {
            "01": "FAILED",
            "02": "FAILED",
            "03": "FAILED",
            "04": "FAILED",
            "05": "FAILED",
            "06": "FAILED",
        },
        "finalAnswers": {
            "01": "FAILED",
            "02": "FAILED",
            "03": "FAILED",
            "04": "FAILED",
            "05": "FAILED",
            "06": "FAILED",
          }
    };
}

function buildSystemMessageForResolvingQuestions(state: any): string {

    return `Twoim zadaniem jest odpowiedzieć pytanie użytkownika na podstawie wiedzy, którą masz posiadasz w dostarczonym kontekście.

W kontekście otrzymasz:
- transkrypcje rozmów z kilku rozmów telefonicznych -> transkrypcje
- imię kłamcy, którego wypowiedzi w tych rozmowach nie są zgodne z prawdą. Uważaj na to co mówi -> kłamca
- prawidłowe odpowiedzi na wcześniejsze pytania użytkownika -> zaliczone
- podpowiedzi systemu weryfinacyjnego jeśli poprzednia odpowiedź była nieprawidłowa -> wskazówki
- listę nieprawidłowych odpowiedzi, które nie zostały uznane przez system weryfikacyjny -> zakazane

Jeśli, któras sekcja jest pusta to nie mamy jeszcze odpowiedzi

Zwróć odpowiedź jako obiekt JSON.

<response_structure>
{
	"_thinking": Wyjaśnij swoją decyzję i sposób rozumowania. Wyjaśnij swoją ospowiedź na pytanie.
	"answer": Podaj krótką odpowiedź na pytanie użytkownika
}
</response_structure>

<context>
**transkrypcje**

${state['transcriptions']}

**kłamca**

Samuel

**zaliczone**



**wskazówki**



**zakazane**


</context>
    `
}

function buildSystemMessageForChoosingTool(): string {

    return `Twoim zadaniem jest przeanalizowanie pytania użytkonika i wybranie jednego z dwóch narzędzi, które umożliwi wykonanie zadania.

Dostępne narzędzia:
general - to narzędzie odpowiada na pytania użytkownika na podstawie wiedzy LLM lub dostarczonego kontektu.
curl - to narzędzie wykonuje żądanie do endpointu API na podstawie dostarczonych w kontekście informacji.

Zwróć odpowiedź jako obiekt JSON.

<response_structure>
{
	"_thinking": Wyjaśnij swoją decyzję i sposob rozumowania. Odpowiedz dlaczego wybrałeś dane narzędzie
	"tool": Podaj Nazwę narzędzia i nic więcej i nic więcej. 
}
</response_structure>
    `
}

async function processFailedAnswers(state: any) {
    const { questions, transcriptions, finalAnswers, stateAnswers} = state;
    
    for (const [questionId, status] of Object.entries(state['finalAnswers'])) {
        if (status === "FAILED") {
            try {
                state['currentQuestion'] = questionId;
                let attempts = 0;
                interface ApiResponse {
                    code: number;
                    message: string;
                }

                let response: ApiResponse = {
                    code: -1,
                    message: "Not attempted"
                };
                
                while (attempts < 5) {
                    const toolAnswer = await askGpt(buildSystemMessageForChoosingTool(), questions[questionId]);
                    console.log(`TOOL (attempt ${attempts + 1}/5):`);
                    
                    // Create an object with 6 values as required by the API
    
                    const agentAnswer = await askGpt(buildSystemMessageForResolvingQuestions(state), questions[questionId]);

                    const tryAnswer = JSON.parse(agentAnswer).answer

                    stateAnswers[questionId] = tryAnswer
                    
                    response = await send_answer3("phone", stateAnswers) as ApiResponse;

                    attempts++;
                    
                    if (response.code === 0) {
                        finalAnswers[questionId] = "SUCCESS";
                        console.log(`Question ${questionId} processed successfully on attempt ${attempts}`);
                        break;
                    } else {
                        console.log(`Question ${questionId} failed attempt ${attempts}:`, response.message);
                    }
                }
                
                if (response.code !== 0) {
                    console.log(`Question ${questionId} failed after 5 attempts, stopping further processing`);
                    return state;
                }
            } catch (error) {
                console.error(`Error processing question ${questionId}:`, error);
                return state;
            }
        }
    }
    return state;
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


    // const liar = await identifyLiar(JSON.stringify(transcriptionsJson));
    // console.log("liar:", liar);
    // await storeKnowledge(JSON.parse(liar), "liar");


    // const answer = await send_answer3("phone", questions)

    // const wrong = await verifyAnswerCorrect(answer);
    // console.log("wrong:", wrong);

    const state = checkFileExists('agent_state.json')
        ? await readKnowledge("agent_state")
        : agentInitState(questions, transcriptionsJson);
    console.log("State:", state);
    
    const updatedState = await processFailedAnswers(state);
    await storeKnowledge(updatedState, "agent_state");
    console.log("Final state:", updatedState);


    // console.log(await readKnowledge("liar"))
}

main().catch(console.error);
