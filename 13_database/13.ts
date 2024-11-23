import { send_answer3 } from "../modules/tasks"
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat';

const openai = new OpenAI();

async function selectDB(centralaUrl: string, apikey: string, query: string): Promise<Record<string, any>> {
    const payload = {
        "task": "database",
        "apikey": apikey,
        "query": query
    };

    const response = await fetch(centralaUrl + 'apidb', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    const data = await response.json() as Record<string, any>;
    return data;
};

function askGpt(context: string, question: string): Promise<string> {

    const systemMsg = `You are advanced database developer which has access to new database. You should 
    help user to response to question. You will be able to build your own context as response for queries. 
    Respond only on data from context.
    
    Respond as JSON with structure

    {
        "queries": [table ob strings with queries which you would liek to ask. No more that 2 in interation]
        "response": Response to user query only when you ar sure about answer. If you need more data in cotext leave this empty
        "problems": Share here if you not understand something in data  structure
    }
    
    <available queries>
    show create table NAZWA_TABELI -  show structure of table NAZWA_TABELI
    
    select * from users limit 1 - return one user (you can use sql syntax to improve this query)
    </available queries>

    <context>
    ${context}
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
        model: "gpt-4o",
        messages: messages,
        max_tokens: 16384,
        response_format: { type: "text" }
    }).then(completion => completion.choices[0].message.content || '')
    .catch(error => {
        console.error("Error in OpenAI completion:", error);
        throw error;
    });
}


async function main() {
    // Get URL from environment variable and validate
    const url = process.env.CENTRALA_URL;
    const taskKey = process.env.TASKS_API_KEY;

    if (!url || !taskKey) {
        return Promise.reject(new Error('Environment variables are not set'));
    }

    const userQuery = "które aktywne datacenter (DC_ID) są zarządzane przez pracowników, którzy są na urlopie (is_active=0)"

    // const showDB = await selectDB(url, taskKey, "show tables");
    // console.log("DBs: ", showDB);
    
    // const iter1 = await askGpt(`databases:
    
    // ${showDB}
    // `, userQuery);

    // console.log("Iter1: ", iter1);

    // const showTableDatacenters = await selectDB(url, taskKey, "show create table datacenters");
    // console.log("Datacenters: ", showTableDatacenters);

    // const showTableUsers = await selectDB(url, taskKey, "show create table users");
    // console.log("Users: ", showTableUsers);

    // const iter2 = await askGpt(`databases:
    
    //     ${showDB}

    //     sql table structure of 'datacenters' (result of query - show create table datacenters):

    //     ${showTableDatacenters}

    //     sql table structure of 'users' (result of query - show create table datacenters)"
    //     ${showTableUsers}

    //     <database structure>
    //     datacenters:
    //     'manager' - it is 'id' key from table user, you can connect this two tables based on this value
    //     'is_active' with value '1' means that datacenter is active 
        
    //     users:
    //     'id' - it is 'manager' key from table datacenters, you can connect this two tables based on this value
    //     'access_level' - define access level
    //     'is_active' with value '0' means that person is on holiday


    //     It should be possible to create join based on 'manager' from 'datacenters' and 'id' from 'users'. Example:

    //     SELECT 
    //         datacenters.dc_id,
    //     FROM 
    //         datacenters
    //     JOIN 
    //         users
    //     ON 
    //         datacenters.manager = users.id;
    //     WHERE 
    //         datacenters.is_active = 1 users.is_active = 0
    //     </database structure>

    //     `, userQuery);
    
    // console.log("Iter2: ", iter2);


    // const exampleDatacenters = await selectDB(url, taskKey, "select * from datacenters where is_active=1");
    // console.log("Users: ", exampleDatacenters);
    // const exampleUsers = await selectDB(url, taskKey, "select * from users where is_active=0");
    // console.log("Users: ", exampleUsers);

    // const iter3 = await askGpt(`databases:
    
    //     ${showDB}

    //     sql table structure of 'datacenters' (result of query - show create table datacenters):

    //     ${showTableDatacenters}

    //     sql table structure of 'users' (result of query - show create table users)"
    //     ${showTableUsers}

    //     example data from  'datacenters' (result of query - select * from datacenters where is_active=1):

    //     ${exampleDatacenters}

    //     sql table structure of 'users' (result of query - select * from users where is_active=0)"
    //     ${exampleUsers}

    //     <database structure>
    //     datacenters:
    //     'manager' - it is 'id' key from table user, you can connect this two tables based on this value
    //     'is_active' with value '1' means that datacenter is active 
        
    //     users:
    //     'id' - it is 'manager' key from table datacenters, you can connect this two tables based on this value
    //     'access_level' - define access level
    //     'is_active' with value '0' means that person is on holiday
    //     </database structure>

    //     `, userQuery);
    
    // console.log("Iter3: ", iter3);


    const dcIds = await selectDB(url, taskKey, `SELECT datacenters.dc_id FROM datacenters JOIN users ON datacenters.manager = users.id WHERE datacenters.is_active = "1" AND users.is_active = "0"`);
    console.log("Answer: ", dcIds);

    await send_answer3("database", [dcIds.reply[0].dc_id, dcIds.reply[1].dc_id]);
}

main().catch(console.error);
