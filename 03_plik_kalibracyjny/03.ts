import { send_answer3 } from "../modules/tasks"

import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';

const openai = new OpenAI();

async function downloadCalibrationFile(centralaUrl: string, taskApi: string): Promise<any> {
    const jsonContent = fs.readFileSync(path.join(__dirname, 'json.txt'), 'utf-8');
    return JSON.parse(jsonContent);
}

interface TestQuestion {
    q: string;
    a: string;
}

interface TestData {
    question: string;
    answer: number;
    entity?: number;
    test?: TestQuestion;
}

async function updateTestData(data: any): Promise<TestData[]> {
    const processedData = [...data];

    for (const item of processedData) {
        // Evaluate mathematical expression
        try {
            const result = eval(item.question);
            item.answer = result;
            if (result !== item.answer) {
                console.log(`Updated entity for question "${item.question}" to ${result}`);
            }
        } catch (error) {
            console.error(`Error evaluating expression "${item.question}":`, error);
        }

        // Handle test questions using OpenAI
        if (item.test?.q) {
            try {
                const completion = await openai.chat.completions.create({
                    messages: [{ role: "user", content: item.test.q }],
                    model: "gpt-3.5-turbo",
                });

                const answer = completion.choices[0].message.content;
                item.test.a = answer || "No answer received";
                console.log(`Updated test answer for question "${item.test.q}" to "${answer}"`);
            } catch (error) {
                console.error(`Error getting OpenAI response for "${item.test.q}":`, error);
                item.test.a = "Error getting response";
            }
        }
    }

    return processedData;
}

function storeJsonToFile(data: any, filename: string = 'output.txt'): void {
    try {
        const jsonString = JSON.stringify(data, null, 2);
        fs.writeFileSync(path.join(__dirname, filename), jsonString, 'utf-8');
        console.log(`Successfully stored JSON data in ${filename}`);
    } catch (error) {
        console.error('Error storing JSON data:', error);
        throw error;
    }
}

async function main() {
    const url = process.env.CENTRALA_URL;
    const taskKey = process.env.TASKS_API_KEY;

    if (!url || !taskKey) {
        throw new Error('Environment variables are not set');
    }

    const calibrationJson = await downloadCalibrationFile(url, taskKey);
    
    calibrationJson.apikey = taskKey; // Update apikey with taskKey value
    
    const updatedTestData = await updateTestData(calibrationJson['test-data']);
    console.log('JSON file:', updatedTestData);

    calibrationJson['test-data'] = updatedTestData;

    // Store the updated JSON to output.txt
    // storeJsonToFile(calibrationJson);

    await send_answer3("JSON", calibrationJson)
}

main().catch(console.error);
