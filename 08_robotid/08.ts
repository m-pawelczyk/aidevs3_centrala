import { send_answer3 } from "../modules/tasks"
import OpenAI from "openai";

const openai = new OpenAI();


async function downloadJsonFileWithData(centralaUrl: string, taskKey: string): Promise<any> {
    const response = await fetch(centralaUrl + '/data/' + taskKey + '/robotid.json');
    if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
    }
    return response.text();
}

async function generateRobotImage(content: string): Promise<string> {
    const prompt = `Create a photorealistic, highly detailed image with perfect lighting 
    and composition. Please apply all details from description of robot. Please take closer look 
    to details and professional terms used in description. It could be names of tools. Description 
    could also describe some characteristic how robot move and other specification. 
    
    DESCRIPTION: ${content}
    `;

    const response = await openai.images.generate({
        model: "dall-e-3",
        prompt: prompt,
        n: 1,
        size: "1024x1024",
    });

    const imageUrl = response.data[0].url;
    if (!imageUrl) {
        throw new Error("Failed to generate image URL");
    }

    return imageUrl;
}

async function main() {
    const url = process.env.CENTRALA_URL;
    const taskKey = process.env.TASKS_API_KEY;
    const ollamaUrl = process.env.LOCAL_OLLAMA_URL;

    if (!url || !taskKey || !ollamaUrl) {
        throw new Error('Environment variables are not set');
    }

    const robotJson = JSON.parse(await downloadJsonFileWithData(url, taskKey));
    console.log('ROBOT JSON file:', robotJson);      
    
    const imageUrl = await generateRobotImage(robotJson.description)
    console.log('ROBOT image:', imageUrl);  
    
    await send_answer3("robotid", imageUrl);
}

main().catch(console.error);
