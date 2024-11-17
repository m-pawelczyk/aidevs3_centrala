import OpenAI from 'openai';
import { NodeHtmlMarkdown, NodeHtmlMarkdownOptions } from 'node-html-markdown'

const openai = new OpenAI();

function extractMarkdownAttachments(markdown: string): Record<string, string> {
    const attachments: Record<string, string> = {};
    
    // Match both ![](path) and [name](path) patterns
    const regex = /(!?\[[^\]]*\]\([^)]+\))/g;
    let match;

    while ((match = regex.exec(markdown)) !== null) {
        const fullTag = match[1];
        // Extract the path from between parentheses
        const pathMatch = fullTag.match(/\(([^)]+)\)/);
        if (pathMatch) {
            const path = pathMatch[1];
            attachments[fullTag] = path;
        }
    }

    return attachments;
}

async function describePng(filePath: string): Promise<string> {
    console.log("describe PNG: ", filePath)
    return "a"
}

async function transcribeMp3(filePath: string): Promise<string> {
    console.log("describe MPS: ", filePath)
    return "b"
}

async function processMediaJson(json: Record<string, string>
): Promise<Record<string, string>> {
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(json)) {
        // Check file extension to determine which processor to use
        if (value.toLowerCase().endsWith('.png')) {
            result[key] = await describePng(value);
        } else if (value.toLowerCase().endsWith('.mp3')) {
            result[key] = await transcribeMp3(value);
        } else {
            // For any other file types, keep the original value
            result[key] = value;
        }
    }

    return result;
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

async function main() {
    // Get URL from environment variable and validate
    const url = process.env.ANTY_CAPTCHA_URL;
    if (!url) {
        throw new Error('ANTY_CAPTCHA_URL environment variable is not set');
    }

    const htmlPage = await downloadHtml("https://centrala.ag3nts.org/dane/arxiv-draft.html");
    const mdPage = NodeHtmlMarkdown.translate(htmlPage);
    
    // Extract attachments from markdown
    const attachments = extractMarkdownAttachments(mdPage);
    console.log("Attachments found:", attachments);

    processMediaJson(attachments)
}

main().catch(console.error);
