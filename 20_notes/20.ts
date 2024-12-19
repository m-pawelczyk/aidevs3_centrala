import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { NodeHtmlMarkdown, NodeHtmlMarkdownOptions } from 'node-html-markdown'
import path from 'path';
import { send_answer3 } from "../modules/tasks";
import * as fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist'
import { TextItem, TextMarkedContent } from 'pdfjs-dist/types/src/display/api';

const openai = new OpenAI();

async function extractTextFromPDF(pdfPath: string) {
    // Use Bun's file API
    const data = await Bun.file(pdfPath).arrayBuffer();
    const uint8Array = new Uint8Array(data);
    
    // Load the PDF document with proper configuration
    const loadingTask = pdfjsLib.getDocument({
        data: uint8Array,
        useWorkerFetch: false,
        isEvalSupported: false,
        useSystemFonts: true
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

async function waitForObject(obj: any, objId: string, maxAttempts = 10): Promise<any> {
    let attempts = 0;
    while (attempts < maxAttempts) {
        try {
            const data = await obj.get(objId);
            if (data) return data;
        } catch (error) {
            attempts++;
            if (attempts >= maxAttempts) throw error;
            await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms between attempts
        }
    }
    throw new Error(`Failed to load object ${objId} after ${maxAttempts} attempts`);
}

async function extractImagesFromPDF(pdfPath: string) {
    // Use Bun's file API
    const data = await Bun.file(pdfPath).arrayBuffer();
    const uint8Array = new Uint8Array(data);
    
    const loadingTask = pdfjsLib.getDocument({
        data: uint8Array,
        useWorkerFetch: false,
        isEvalSupported: false,
        useSystemFonts: true
    });
    
    const pdfDocument = await loadingTask.promise;
    console.log(`PDF loaded with ${pdfDocument.numPages} pages.`);

    // Create temp directory if it doesn't exist
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }

    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
        try {
            const page = await pdfDocument.getPage(pageNum);
            console.log(`Processing page ${pageNum}...`);

            // Get the operator list
            const opList = await page.getOperatorList();
            
            // Get page objects
            const commonObjs = page.commonObjs;
            const objs = page.objs;

            for (let i = 0; i < opList.fnArray.length; i++) {
                const fnId = opList.fnArray[i];
                const args = opList.argsArray[i];

                // Check for XObject painting operations
                if (fnId === pdfjsLib.OPS.paintImageXObject) {
                    const imageObjId = args[0];
                    
                    try {
                        // Try to get the image with retry mechanism
                        let imgData;
                        try {
                            imgData = await waitForObject(commonObjs, imageObjId);
                        } catch {
                            imgData = await waitForObject(objs, imageObjId);
                        }


                        if (imgData && imgData.data) {
                            console.log(`Found image on page ${pageNum}, object ID: ${imageObjId}`);
                            
                            // Create a Uint8Array from the image data
                            const imageData = imgData.data instanceof Uint8ClampedArray ? 
                                new Uint8Array(imgData.data.buffer) : 
                                imgData.data;
                            
                            // Save the image
                            const fileName = path.join(tempDir, `page${pageNum}_image${i}.png`);
                            fs.writeFileSync(fileName, imageData);
                            console.log(`Saved image to: ${fileName}`);
                        }
                    } catch (error: any) {
                        console.warn(`Failed to process image ${imageObjId} on page ${pageNum}:`, error.message);
                        continue; // Continue with next image
                    }
                }
            }
        } catch (error: any) {
            console.error(`Error processing page ${pageNum}:`, error.message);
            continue; // Continue with next page
        }
    }
}

async function main() {
    const url = process.env.CENTRALA_URL;
    const taskKey = process.env.TASKS_API_KEY;

    if (!url || !taskKey) {
        return Promise.reject(new Error('Environment variables are not set'));
    }

    const pathPDF = path.join(__dirname, 'data', 'notatnik-rafala.pdf');
    console.log('Reading PDF from:', pathPDF);
    
    try {
        const text = await extractTextFromPDF(pathPDF);
        console.log('Extracted text:', text);
        await extractImagesFromPDF(pathPDF);
    } catch (error: any) {
        console.error('Error extracting text from PDF:', error.message);
    }
}

main().catch(console.error);
