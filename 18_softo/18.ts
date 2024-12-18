import * as fs from 'fs';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { NodeHtmlMarkdown, NodeHtmlMarkdownOptions } from 'node-html-markdown'
import * as path from 'path';
import { send_answer3 } from "../modules/tasks";

const openai = new OpenAI();

interface TaskQuestions {
    "01": string;
    "02": string;
    "03": string;
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

async function downloadHtml(url: string): Promise<string> {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.text();;
    } catch (error) {
        throw new Error(`Failed to download HTML: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

function checkPage(markdownPage: string, alredyViewedLink: string, question: string): Promise<string> {   
    const systemMsg = `Masz za zadanie odpowiedzieć na pytanie użytkownika tylko na podstawie stron informacji ze strony https://softo.ag3nts.org Strona jest bardzo duża i nie jesteśmy w stanie zaladować jej pelnej treści. W kontekście masz jedną aktualnie załadowaną stronę. Odpowiedz w krotki i zwięzły sposob na pytanie użytkownika tylko jeśli ta opowiedź znajduje się w kontekście. Jeśli nie znasz odpowiedzi to wskaż linka z biezacej strony, który powinienem załadować, bo uważasz, że tam znajduje się odpowiedź. Odpowiedź zwroć w formacie JSON.

<response_format>
{
	"_thinking": Wyjaśnienie twojej decyzji i procesu rozumowania,
	"answer": Wyepełnij jeśli znasz odpowiedż,
	"link": Podaj adres linku, który chcesz załadować,
	"ready": true - jeśli znasz odpowiedź i wypełniłeś pole answer, false w przeciwnym wypadku
}
</response_format>

Na poniższej liście znajduje się lista stron, które już odwiedziłeś i nie znalazleś odpowiedzi. Nie ma sensu odwiedzać ich ponownie
<list_viewed_pages>
${alredyViewedLink}
</list_viewed_pages>

<context>
${markdownPage}
</context>
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

async function processQuestion(question: string, indexPage: string): Promise<string> {
    let counter = 0;
    let ready = false;

    let listOfViewedPages = []
    let linkToVisit = indexPage
    let htmlPage;
    let mdPage;
    let gptAnswer;
    let gptAnswerAsJSON;

    while (counter < 5 && !ready) {
        counter++;
        console.log(`=== START Question: ${question}, iteration: ${counter} ===`);
        // Here would be the logic to process questions and set ready flag
        // For now we just increment counter
        htmlPage = await downloadHtml(linkToVisit);
        mdPage = NodeHtmlMarkdown.translate(htmlPage);
        listOfViewedPages.push(linkToVisit);
        console.log("visited page:", linkToVisit);

        gptAnswer = await checkPage(mdPage, listOfViewedPages.join(" "), question)

        gptAnswerAsJSON = JSON.parse(gptAnswer);

        console.log("gpt answer:", gptAnswerAsJSON);

        ready = gptAnswerAsJSON.ready

        if (ready !== true) {
            linkToVisit = gptAnswerAsJSON.link
        } 
        console.log("=== END Question: {}, interation: {} ===", question, counter)
    }

    if (ready === true) {
        return gptAnswerAsJSON.answer
    } else {
        return "UNKNOW";
    }
}

async function main() {
    // It is horrible solution and have to be fixed, but I have spent too much time on this :/ 

    const url = process.env.CENTRALA_URL;
    const taskKey = process.env.TASKS_API_KEY;

    if (!url || !taskKey) {
        return Promise.reject(new Error('Environment variables are not set'));
    }

    const questions = await requestTaskQuestions("https://centrala.ag3nts.org/data/" + taskKey + "/softo.json")

    console.log("Questions:", questions);


    const one = await processQuestion(questions['01'], "https://softo.ag3nts.org");
    console.log("ONE:", one)

    const two = await processQuestion(questions['02'], "https://softo.ag3nts.org");
    console.log("TWO:", two)

    const three = await processQuestion(questions['03'], "https://softo.ag3nts.org");
    console.log("THREE:", three)

    // await send_answer3("softo", "Heloł")
}

main().catch(console.error);
