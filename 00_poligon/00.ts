import { send_answer2 } from "../modules/tasks"

const poligon = async () => {
    const response = await fetch('https://poligon.aidevs.pl/dane.txt');
    const text = await response.text();
    const data = text.split('\n').filter(line => line.trim());
    console.log(data)
    await send_answer2("POLIGON", data)
}

poligon()
