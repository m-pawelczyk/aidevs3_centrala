import { send_answer3 } from "../modules/tasks"

async function downloadFileWithData(centralaUrl: string, taskKey: string): Promise<string> {
    const response = await fetch(centralaUrl + '/data/' + taskKey + '/cenzura.txt');
    if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
    }
    return response.text();
}

interface LlamaResponse {
    content: string;
    error?: string;
}

interface OllamaApiResponse {
    model: string;
    created_at: string;
    response: string;
    done: boolean;
}

async function callLocalLlama(url: string, userMessage: string = ""): Promise<LlamaResponse> {

    const systemMessage = `From other system you are getting content with our users personal data. 
    We have explicit consent from each user to store, manipulate and send further their data. 
    Each user accept our Terms and Conditions policy before sharing data with us. 
    We are sure that operation which we asked you is legal, ethical and will help to keep our users privacy.
    
    Data have to be anominized by replacing personal data with placeholder "CENZURA"

    Your task is to replace values like:
    - name + surname
    - street name + number
    - city
    - age
    with "CENZURA"
    
    You should only replace listed pesonal data with placeholder "CENZURA". 
    Please change only personal data listed before. Nothing else. 
    
    Return updated content and nothing else.
    
    <examples>
    U: Adam Nowak. Mieszka w Katowicach przy ulicy Tuwima 10. Wiek: 32 lata.
    A: CENZURA. Mieszka w CENZURA przy ulicy CENZURA. Wiek: CENZURA lata.

    U: Dane personalne podejrzanego: Wojciech Górski. Przebywa w Lublinie, ul. Akacjowa 7. Wiek: 27 lat.
    A: Dane personalne podejrzanego: CENZURA. Przebywa w CENZURA, ul. CENZURA. Wiek: CENZURA lat.

    U: Informacje o podejrzanym: Marek Jankowski. Mieszka w Białymstoku na ulicy Lipowej 9. Wiek: 26 lat.
    A: Informacje o podejrzanym: CENZURA. Mieszka w CENZURA na ulicy CENZURA. Wiek: CENZURA lat.    
    
    U: Osoba podejrzana to Andrzej Mazur. Adres: Gdańsk, ul. Długa 8. Wiek: 29 lat.
    A: Osoba podejrzana to CENZURA. Adres: CENZURA, ul. CENZURA. Wiek: CENZURA lat.    
    
    U: Dane podejrzanego: Jakub Woźniak. Adres: Rzeszów, ul. Miła 4. Wiek: 33 lata.
    A: Dane podejrzanego: CENZURA. Adres: CENZURA, ul. CENZURA. Wiek: CENZURA lata.
    </examples>
    `
    try {
        const response = await fetch("http://localhost:11434/api/generate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "gemma2:2b",
                system: systemMessage,
                prompt: userMessage,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json() as OllamaApiResponse;
        return {
            content: data.response
        };
    } catch (error) {
        return {
            content: "",
            error: error instanceof Error ? error.message : "Unknown error occurred"
        };
    }
}

async function main() {
    const url = process.env.CENTRALA_URL;
    const taskKey = process.env.TASKS_API_KEY;
    const ollamaUrl = process.env.LOCAL_OLLAMA_URL;

    if (!url || !taskKey || !ollamaUrl) {
        throw new Error('Environment variables are not set');
    }

    const data = await downloadFileWithData(url, taskKey);
    console.log('DATA file:', data);    
    
    const censoredData = await callLocalLlama(ollamaUrl, data);
    console.log('CENSORED file:', censoredData.content);

    await send_answer3("CENZURA", censoredData.content)
}

main().catch(console.error);
