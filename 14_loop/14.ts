import * as fs from 'fs';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import * as path from 'path';
import { send_answer3 } from "../modules/tasks";

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
        
        // Only process and store values if code is 0
        if (response.code !== 0) {
            console.log(`Invalid response code ${response.code} for query: ${query}`);
            return [];
        }

        if (!response.message) {
            console.log(`No message in response for query: ${query}`);
            return [];
        }

        const values = replaceAndSplit(response.message);
        
        // Store result in appropriate section and process recursively only if code is 0
        if (endpoint === "/people") {
            currentJson.people[query] = values;
            console.log("PEOPLE", query, "->", values);
            
            // Recursively process each place mentioned by this person
            for (const value of values) {
                if (!processedQueries.has(value)) {
                    const relatedValues = await processQuery(value, otherEndpoint, endpoint, currentJson);
                    if (relatedValues.length > 0) { // Only store if we got valid values
                        currentJson.places[value] = relatedValues;
                    }
                }
            }
        } else {
            currentJson.places[query] = values;
            console.log("PLACES", query, "->", values);
            
            // Recursively process each person mentioned for this place
            for (const value of values) {
                if (!processedQueries.has(value)) {
                    const relatedValues = await processQuery(value, otherEndpoint, endpoint, currentJson);
                    if (relatedValues.length > 0) { // Only store if we got valid values
                        currentJson.people[value] = relatedValues;
                    }
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

    const note = loadBarbaraContent();

    const townsFromNote = JSON.parse(await askGpt(`You are allowed to respond to user question only based on your 
        context which i note about Barbara. 
        Provide answer in JSON format and notheing else:

        {
            "answer": [LIST OF KEYWORDS IN CAPILAT LETTERS]
        }

        Use only British alphabet. No Polish letters: Kraków -> KRAKOW

        <example>
        {
            "answer": ["KRAKOW", "LODZ"]
        }
        </example>
        
        
        <context>
        ${note}
        </context>
    `, "Podaj miasta z notatki w mianowniku"));
    console.log("Towns in note: ", townsFromNote);

    const namesFromNote = JSON.parse(await askGpt(`You are allowed to respond to user question only based on your 
        context which i note about Barbara. 
        Provide answer in JSON format and notheing else:

        {
            "answer": [LIST OF KEYWORDS IN CAPILAT LETTERS]
        }

        Use only British alphabet. No Polish letters: Mirosław -> MIROSLAW

        <example>
        {
            "answer": ["KRAKOW", "LODZ"]
        }

        or

        {
            "answer": ["MICHAL", "MIROSLAW"]
        }
        </example>
        
        
        <context>
        ${note}
        </context>
    `, "Podaj polskie imiona z notatki w mianowniku"));
    console.log("Names in note: ", namesFromNote);

    const crossReferencedData = await buildCrossReferencedJson(url, taskKey, 
        {
            people: namesFromNote['answer'],
            places: townsFromNote['answer']
        }
    );
    console.log("Cross-referenced data:", JSON.stringify(crossReferencedData, null, 2));


    const result = JSON.parse(await askGpt(`Jesteś znanym detektywem, który rozwizuje skomplikowane 
        zagadki. Musisz odpowiedzieć na pytanie uytkownika na podstawie notatki i danych, ktore udało 
        nam się zdobyć w formacie JSON. Dane w JSON mog być uszkodzone, badź ostrozny. Przeprowadz 
        uzytkownika przez swoje rozwiazanie krok po kroku i podaj ostateczna odpowiedz w polu 'final_answer'. 

        Musisz wnioskować na teamt połczeń w dostarczonych strukturach JSON. Nie ignoruj tej informacji. 
        Notatka nie wystarczy. Myśl na głos. Uytkownik cię teraz nie słyszy. 

        W polu 'steps' podaj wyjaśnienie rozwizania.
        W polu 'final_answer' podaj tylko nazwę miasta i nic więcej.

        <example>
        {
            "steps": Zosia spotkała się ostatni raz z Jankiem w Londynie. Nikt jej więcej nie widział. Zosia powinna być nadal w Londynie
            'final_answer': LONDYN
        }
        </example>
        
        <context>
        Notatka:
        ${note}

        JSON z miastami - Miasta w których jako wartości sa widoczne imona osob widzianych w tych miejscowościach:
        ${crossReferencedData.people}
        
        JSON z osobami - Osoby w których jako wartości sa widoczne miasta w których były widziane
        ${crossReferencedData.places}
        </context>
    `, "W którym mieście znajduje się Barbara?."));
    console.log("Names in note: ", result);

    const answer = result['final_answer'].replace("Ó", "O")

    console.log("ANSWER: ", answer)

    await send_answer3("loop", "ELBLAG");
}

main().catch(console.error);
