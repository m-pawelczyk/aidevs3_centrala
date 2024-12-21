import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { NodeHtmlMarkdown, NodeHtmlMarkdownOptions } from 'node-html-markdown'
import path from 'path';
import { send_answer3 } from "../modules/tasks";
import * as pdfjsLib from 'pdfjs-dist'
import { TextItem, TextMarkedContent } from 'pdfjs-dist/types/src/display/api';
import { fromPath } from "pdf2pic";
import fs from 'fs/promises';
import { statSync } from 'fs';

const openai = new OpenAI();

function checkOutput(): boolean {
    const outputDir = path.join(__dirname, 'output');
    const outputFile = path.join(outputDir, 'output.txt');
    
    try {
        return statSync(outputDir).isDirectory() && statSync(outputFile).isFile();
    } catch {
        return false;
    }
}

async function readOutput(): Promise<string> {
    const outputDir = path.join(__dirname, 'output');
    const outputFile = path.join(outputDir, 'output.txt');
    
    try {
        const content = await fs.readFile(outputFile, 'utf-8');
        return content;
    } catch (error) {
        throw new Error('Failed to read output.txt: ' + (error as Error).message);
    }
}

async function storeString(content: string): Promise<void> {
    const outputDir = path.join(__dirname, 'output');
    const outputPath = path.join(outputDir, 'output.txt');
    
    try {
        // Create output directory if it doesn't exist
        await fs.mkdir(outputDir, { recursive: true });
        // Write content to file
        await fs.writeFile(outputPath, content, 'utf-8');
    } catch (error) {
        console.error('Error storing string:', error);
        throw error;
    }
}

async function extractTextFromPDF(pdfPath: string) {
    // Read the PDF file
    const data = await Bun.file(pdfPath).arrayBuffer();
    const uint8Array = new Uint8Array(data);
    
    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({
        data: uint8Array,
        verbosity: 0
    });
    
    const pdf = await loadingTask.promise;
    let fullText = '';
    
    // Iterate through all pages
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item) => {
            if ('str' in item) {
                return (item as TextItem).str;
            }
            return '';
        }).join(' ');
        fullText += pageText + '\n\n';
    }
    
    return fullText;
}

async function convertLastPageToImage(pdfPath: string): Promise<void> {
    const pageToConvertAsImage = 19;
    const options = {
        density: 100,
        saveFilename: "last_page",
        savePath: pdfPath.substring(0, pdfPath.lastIndexOf('/') + 1),
        format: "png",
        width: 1024,
        height: 1024
      };
      const convert = fromPath(pdfPath, options);
      
      convert(pageToConvertAsImage, { responseType: "image" })
        .then((resolve) => {
          console.log("Page 19 is now converted as image");
      
          return resolve;
        });
}

async function readLastPageAsBase64(): Promise<string> {
    const pageDir = path.join(__dirname, 'data');
    
    const buffer = await fs.readFile(pageDir + "/last_page.19.png");
    return buffer.toString('base64');
}

async function transformToImageUrlObject(base64Strings: string) : Promise<any[]>{
    return [{
        type: "image_url",
        image_url: {
            url: `data:image/jpeg;base64,${base64Strings}`,
            detail: "high"
        }
    }];
};

async function askGptVisionAboutLastPage(visionMessage: any[]) : Promise<OpenAI.Chat.Completions.ChatCompletion> {
    const systemMessage = `You are advanced OCR scanner which is specialised to read handwritted text. 
    You have a task to scan resources with defects which is common for handwrited resources.
    Please look carefully on data delivered by user and try to extract as much information as possible. 
    Return verbatim text which you can extract from image and only that.`
    const userMessage = {
                type: "text",
                text: "Read notes from notebook page."
            }
    visionMessage.push(userMessage)

    const messages: ChatCompletionMessageParam[] = [
        {
            role: "system",
            content: systemMessage
        },
        {
            role: "user",
            content: visionMessage
        }
    ];
    
    try {
        const chatCompletion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: messages,
            max_tokens: 10000,
            response_format: { type: "text" }
        });
        
        return chatCompletion as OpenAI.Chat.Completions.ChatCompletion;
    } catch (error) {
        console.error("Error in OpenAI completion:", error);
        throw error;
    }
}

async function main() {
    const url = process.env.CENTRALA_URL;
    const taskKey = process.env.TASKS_API_KEY;

    if (!url || !taskKey) {
        return Promise.reject(new Error('Environment variables are not set'));
    }

    if (!checkOutput()) {
        const pathPDF = path.join(__dirname, 'data', 'notatnik-rafala.pdf');
        console.log('Reading PDF from:', pathPDF);
        
        const text = await extractTextFromPDF(pathPDF);
        console.log('Extracted text:', text);
        await convertLastPageToImage(pathPDF);
    
        const lastPage = await readLastPageAsBase64();
        const jsonMessagesWithImages = await transformToImageUrlObject(lastPage);
        const visionResponse = await askGptVisionAboutLastPage(jsonMessagesWithImages);
        console.log("vision:", visionResponse.choices[0].message.content);
        await storeString(text + visionResponse.choices[0].message.content)
    } 

    const rafalaNotes = await readOutput();

    console.log(rafalaNotes, checkOutput())









    
}

main().catch(console.error);
