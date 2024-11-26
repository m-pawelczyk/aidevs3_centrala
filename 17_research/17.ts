import { send_answer3 } from "../modules/tasks"
import OpenAI, { toFile } from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import * as fs from 'fs';
import * as path from 'path';

const openai = new OpenAI();

function transformFileToJsonl(systemMsg: string, filePath: string, category: string): void {
    try {
        // Read all lines from input file
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        
        // Transform each line to required JSON format
        const transformedLines = lines
            .filter(line => line.trim()) // Skip empty lines
            .map(line => {
                const jsonObj = {
                    messages: [
                        { role: "system", content: systemMsg },
                        { role: "user", content: line.trim() },
                        { role: "assistant", content: category }
                    ]
                };
                return JSON.stringify(jsonObj);
            });

        // Get directory of input file and create examples.jsonl in the same directory
        const outputPath = path.join(path.dirname(filePath), 'examples.jsonl');
        
        // Append each transformed line to examples.jsonl
        transformedLines.forEach(line => {
            fs.appendFileSync(outputPath, line + '\n');
        });
    } catch (error) {
        console.error('Error processing file:', error);
        throw error;
    }
}

function askGpt(knowledge: string, question: string): Promise<string> {
    const systemMsg = `Respond to user question using your context. Respond shortly in one sentence, 
    but inslude as much detail as possible. Use specific names not general ones.

    <context>
    ${knowledge}
    </context>
    `
    
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
        max_tokens: 16384,
        response_format: { type: "text" }
    }).then(completion => completion.choices[0].message.content || '')
    .catch(error => {
        console.error("Error in OpenAI completion:", error);
        throw error;
    });
}

async function askGPT(numbers: string): Promise<string> {
    const messages: ChatCompletionMessageParam[] = [
        {
            role: "system",
            content: "Evaluate the sequence of numbers."
        },
        {
            role: "user",
            content: numbers
        }
    ];
    
    const completion = await openai.chat.completions.create({
        model: "ft:gpt-4o-mini-2024-07-18:personal::AXxBQgCf",
        messages: messages,
        max_tokens: 100,
        temperature: 0
    });

    return completion.choices[0].message.content || '';
}

async function processFile(filePath: string): Promise<string[]> {
    try {
        // Read file content
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        
        const correctIds: string[] = [];
        
        // Process each line
        for (const line of lines) {
            // Split line into identifier and numbers
            const [identifier, numbers] = line.split('=');
            if (!identifier || !numbers) continue;
            
            // Call askGPT with the numbers
            const result = await askGPT(numbers);
            
            // If result is CORRECT, add identifier to array
            if (result.trim() === 'CORRECT') {
                correctIds.push(identifier);
            }
        }
        
        return correctIds;
    } catch (error) {
        console.error('Error processing file:', error);
        throw error;
    }
}

async function main() {
    // Get URL from environment variable and validate
    const url = process.env.CENTRALA_URL;
    const taskKey = process.env.TASKS_API_KEY;

    if (!url || !taskKey) {
        return Promise.reject(new Error('Environment variables are not set'));
    }

    // await transformFileToJsonl("Evaluate the sequence of numbers.", path.join(__dirname, 'data') + "/correct.txt", "CORRECT")
    // await transformFileToJsonl("Evaluate the sequence of numbers.", path.join(__dirname, 'data') + "/incorrect.txt", "INCORRECT")

    // await send_answer3("research", responses);

    // const fineTune = await openai.fineTuning.jobs.create({
    //     model: "gpt-4o-mini-2024-07-18",
    //     training_file: "file-NA3g85tYNxJH3qK26N4h9p"
    // });
    // console.log(fineTune);
    
    const correctIds = await processFile(path.join(__dirname, 'data') + "/verify.txt")
    console.log("RESEARCH:", correctIds);

    await send_answer3("research", correctIds);
}

main().catch(console.error);
