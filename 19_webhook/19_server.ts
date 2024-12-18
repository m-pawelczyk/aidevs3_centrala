import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { NodeHtmlMarkdown, NodeHtmlMarkdownOptions } from 'node-html-markdown'
import { send_answer3 } from "../modules/tasks";
import express, { Request, Response } from 'express';

const openai = new OpenAI();
const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

interface DroneInstruction {
    instruction: string;
}

async function describeLandingField(question: string): Promise<string> {   
    const systemMsg = `Your task is to help drone pilot to verify what is on his possition to help him landing. Drone is always starting from the same point with coordinates 0,0. YOu will get from user instructions in natural language how drone move on map.

The map is square closed area 4 fields long and 4 fields hight. So map has 16. fields is total.

- Starting point of drone is top left corner with coordinates 0,0
- top tight corner is 3,0
- bottom left corner is 0,3
- bottom right corner is 3,3

You have to resolve instrunction from user and repond in maximum two words in Polish what is under drone after move. Repond with JSON with structure:

<response_format>
{
	"_thinking": describe your wya of thinking to give response in description
	"description": description of field under drone in two words
}
</response_format>

To gen information about what is under drone use ocontext below

<context>
coordinates of fields:
0,0 - punkt startowy
2,0 - drzewo
3,0 - dom
1,1 - wiatrak
2,2 - skaly
3,2 - dwa drzewa
0,3 - góry
1,3 - góry
2,3 - samochód
3,3 - jaskinia

wszystkie pozostałe pola - trawa
</context>

<examples>
U: Poleciałem do końca w prawo i do końca w dół.
A: {
	"_thinking": "Dron poleciał do kónca w prawo więc osiągnął punkt 3,0 a następnie do końca w dół do punktu 3,3. 3,3 to jaskinia"
	"description": "jaskinia"
}

U: Dron polecnia dwa pola w dół i dwa do góry
A: {
	"_thinking": "Dron polecnia dwa pola w dół i dwa do góry, czyli wrócił do miejsca początkowego. To jest punkt 0,0"
	"description": "punkt startowy"
}
</examples>
    `
    return askGpt(systemMsg, question)
}

async function askGpt(systemMsg: string, question: string): Promise<string> {    
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


// POST endpoint to handle drone instructions
app.post('/', async (req: Request<{}, {}, DroneInstruction>, res: Response) => {
    const { instruction } = req.body;
    
    if (!instruction) {
        return res.status(400).json({ error: 'Missing instruction in payload' });
    }

    console.log('Received instruction:', instruction);
    const pilotResponse = await describeLandingField(instruction);
    console.log('Pilot response:', pilotResponse);
    res.status(200).json(JSON.parse(pilotResponse));
});

// GET endpoint to return OK_RUNNING
app.get('/', (req: Request, res: Response) => {
    res.send('OK_RUNNING');
});

async function main() {
    // Start the server
    app.listen(8080, () => {
        console.log('Server is running on http://localhost:8080');
    });
}

main().catch(console.error);
