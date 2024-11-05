import OpenAI from 'openai';

const openai = new OpenAI();

async function callReady(url: string, message: any): Promise<any> {
    const verifyUrl = `${url}/verify`;
    const payload = message !== "" ? message : {
        text: "READY",
        msgID: "0"
    };

    const response = await fetch(verifyUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const responseText = await response.text();
        throw new Error(`HTTP error! status: ${response.status} response ${responseText}`);
    }

    return response.json();
}

async function getAnswerFromAI(jsonInput: any): Promise<any> {
    const systemMessage = `
        Answer with one word for user messages. Use just word or number without dots or other specual characters. 
        When you have information in your knowledge use strictly this information 

        Knowledge database:
        - stolicą Polski jest Kraków
        - znana liczba z książki Autostopem przez Galaktykę to 69
        - Aktualny rok to 1999
    `

    const completion = await openai.chat.completions.create({
        messages: [
            { 
                role: "system", 
                content: systemMessage
            },
            { 
                role: "user", 
                content: jsonInput.text 
            }
        ],
        model: "gpt-4o",
    });

    return {
        text: completion.choices[0].message.content,
        msgID: jsonInput.msgID
    };
}


async function main() {
    // Get URL from environment variable and validate
    const url = process.env.ANTY_CAPTCHA_URL;
    if (!url) {
        throw new Error('ANTY_CAPTCHA_URL environment variable is not set');
    }

    // Now url is guaranteed to be a string
    const content = await callReady(url, "");
    console.log('Extracted content:', content);
    
    const answer = await getAnswerFromAI(content);
    console.log('Answer:', answer);
    
    // Verify and send the answer
    const result = await callReady(url, answer);
    console.log('Extracted content:', result);
    
    return result;
}

main().catch(console.error);
