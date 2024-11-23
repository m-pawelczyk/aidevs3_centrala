import { send_answer3 } from "../modules/tasks"
import OpenAI, { toFile } from 'openai';
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import * as fs from 'fs';
import * as path from 'path';

const openai = new OpenAI();

function loadBarbaraContent(): string {
    const filePath = path.join(__dirname, 'barbara.txt');
    return fs.readFileSync(filePath, 'utf-8');
}

async function selectAPI(centralaUrl: string, apikey: string, apiName: string, query: string): Promise<Record<string, any>> {
    const payload = {
        "apikey": apikey,
        "query": query
    };
    const response = await fetch(centralaUrl + apiName, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
    const data = await response.json() as Record<string, any>;
    return data;
};

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

interface InitialInput {
    places: string[];
    people: string[];
}

interface ResultStructure {
    people: Record<string, any>;
    places: Record<string, any>;
}

async function buildCrossReferencedJson(
    centralaUrl: string, 
    apikey: string, 
    initialInput: InitialInput
): Promise<ResultStructure> {
    const result: ResultStructure = {
        people: {},
        places: {}
    };
    const processedQueries = new Set<string>();

    function replaceAndSplit(inputString: string): string[] {
        // Replace all occurrences of "Ł" with "L"
        let replacedString = inputString.replace("Ł", "L");
        // Split the modified string by spaces into chunks
        let chunks = replacedString.split(" ");
        // Return the chunks as a list (array in JavaScript)
        return chunks;
    }

    async function processQuery(
        query: string, 
        endpoint: string, 
        otherEndpoint: string, 
        currentJson: ResultStructure
    ): Promise<string[]> {
        if (processedQueries.has(query)) {
            return [];
        }

        processedQueries.add(query);
        const response = await selectAPI(centralaUrl, apikey, endpoint, query);
        
        if (!response.message) {
            console.log(`No message in response for query: ${query}`);
            return [];
        }

        const values = replaceAndSplit(response.message);
        
        // Store result in appropriate section and process recursively
        if (endpoint === "/people") {
            currentJson.people[query] = values;
            console.log("PEOPLE", query, "->", values);
            
            // Recursively process each place mentioned by this person
            for (const value of values) {
                if (!processedQueries.has(value)) {
                    const relatedValues = await processQuery(value, otherEndpoint, endpoint, currentJson);
                    currentJson.places[value] = relatedValues;
                }
            }
        } else {
            currentJson.places[query] = values;
            console.log("PLACES", query, "->", values);
            
            // Recursively process each person mentioned for this place
            for (const value of values) {
                if (!processedQueries.has(value)) {
                    const relatedValues = await processQuery(value, otherEndpoint, endpoint, currentJson);
                    currentJson.people[value] = relatedValues;
                }
            }
        }

        return values;
    }

    // Process initial places
    for (const place of initialInput.places) {
        await processQuery(place.replace("Ł", "L"), "/places", "/people", result);
    }

    // Process initial people
    for (const person of initialInput.people) {
        const cleanPerson = person.replace("Ł", "L");
        await processQuery(cleanPerson, "/people", "/places", result);
    }

    return result;
}

async function main() {
    // Get URL from environment variable and validate
    const url = process.env.CENTRALA_URL;
    const taskKey = process.env.TASKS_API_KEY;
    const groqApiKey = process.env.GROQ_API_KEY;

    if (!url || !taskKey) {
        return Promise.reject(new Error('Environment variables are not set'));
    }

    // const note = loadBarbaraContent();

    // const townsFromNote = JSON.parse(await askGpt(`You are allowed to respond to user question only based on your 
    //     context which i note about Barbara. 
    //     Provide answer in JSON format and notheing else:

    //     {
    //         "answer": [LIST OF KEYWORDS IN CAPILAT LETTERS]
    //     }

    //     Use only British alphabet. No Polish letters: Kraków -> KRAKOW

    //     <example>
    //     {
    //         "answer": ["KRAKOW", "LODZ"]
    //     }
    //     </example>
        
        
    //     <context>
    //     ${note}
    //     </context>
    // `, "Podaj miasta z notatki w mianowniku"));
    // console.log("Towns in note: ", townsFromNote);

    // const namesFromNote = JSON.parse(await askGpt(`You are allowed to respond to user question only based on your 
    //     context which i note about Barbara. 
    //     Provide answer in JSON format and notheing else:

    //     {
    //         "answer": [LIST OF KEYWORDS IN CAPILAT LETTERS]
    //     }

    //     Use only British alphabet. No Polish letters: Mirosław -> MIROSLAW

    //     <example>
    //     {
    //         "answer": ["KRAKOW", "LODZ"]
    //     }

    //     or

    //     {
    //         "answer": ["MICHAL", "MIROSLAW"]
    //     }
    //     </example>
        
        
    //     <context>
    //     ${note}
    //     </context>
    // `, "Podaj polskie imiona z notatki w mianowniku"));
    // console.log("Names in note: ", namesFromNote);

    // const crossReferencedData = await buildCrossReferencedJson(url, taskKey, 
    //     {
    //         people: namesFromNote['answer'],
    //         places: townsFromNote['answer']
    //     }
    // );
    // console.log("Cross-referenced data:", JSON.stringify(crossReferencedData, null, 2));


    // https://centrala.ag3nts.org/people 
    // https://centrala.ag3nts.org/places 
    const responses = await selectAPI(url, taskKey, "places", "RAFAŁ")
    console.log("Question responses:", responses);

    // const responses2 = await selectAPI(url, taskKey, "people", "ADAM")
    // console.log("Question responses:", responses2);

    // await send_answer3("arxiv", responses);
}

main().catch(console.error);
