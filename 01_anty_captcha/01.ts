import OpenAI from 'openai';

const openai = new OpenAI();

async function extractHumanQuestion(url: string): Promise<string> {
    try {
        const response = await fetch(url);
        const html = await response.text();
        
        // Extract content using regex
        const match = html.match(/<p id="human-question">(.*?)<\/p>/);
        if (!match) {
            throw new Error('Question element not found');
        }
        
        return match[1];
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
}

async function getAnswerFromAI(content: string): Promise<string> {
    const completion = await openai.chat.completions.create({
        messages: [
            { 
                role: "system", 
                content: "Answer only with year in format yyyy. Nothing else."
            },
            { 
                role: "user", 
                content 
            }
        ],
        model: "gpt-4o",
    });

    return completion.choices[0].message.content;
}

async function verifyAndSendAnswer(answer: string, url: string) {
    // Verify that response is a number
    const numericResponse = Number(answer);
    if (isNaN(numericResponse)) {
        throw new Error("Model response is not a number");
    }

    // Create form data for the POST request
    const formData = new FormData();
    formData.append("username", "tester");
    formData.append("password", "574e112a");
    formData.append("answer", numericResponse.toString());

    // Send POST request
    try {
        const response = await fetch(url, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response;
    } catch (error) {
        console.error("Error sending POST request:", error);
        throw error;
    }
}

async function main() {
    // Get URL from environment variable and validate
    const url = process.env.ANTY_CAPTCHA_URL;
    if (!url) {
        throw new Error('ANTY_CAPTCHA_URL environment variable is not set');
    }

    // Now url is guaranteed to be a string
    const content = await extractHumanQuestion(url);
    console.log('Extracted content:', content);
    
    const answer = await getAnswerFromAI(content);
    console.log('Answer:', answer);
    
    // Verify and send the answer
    const result = await verifyAndSendAnswer(answer, url);
    console.log('Result:', result);
    
    return result;
}

main().catch(console.error);
