import { send_answer3 } from "../modules/tasks";


async function main() {
    const url = process.env.CENTRALA_URL;
    const taskKey = process.env.TASKS_API_KEY;

    if (!url || !taskKey) {
        return Promise.reject(new Error('Environment variables are not set'));
    }

    await send_answer3("webhook", questions)
}

main().catch(console.error);
