import neo4j from 'neo4j-driver';
import { send_answer3 } from "../modules/tasks"

type Driver = any;

type UserDocument = {
    id: string;
    username: string;
    access_level: string;
    is_active: string;
    lastlog: string;
};

type UserRelation = {
    user1_id: string;
    user2_id: string;
};

export class Neo4jService {
    private driver: Driver;

    constructor() {
        this.driver = neo4j.driver(
            'bolt://localhost:7687',
            neo4j.auth.basic('neo4j', 'Test1234')
        );
    }

    async verifyConnection(): Promise<boolean> {
        try {
            const session = this.driver.session();
            await session.run('RETURN 1');
            await session.close();
            return true;
        } catch (error) {
            console.error('Failed to connect to Neo4j:', error);
            return false;
        }
    }

    async addDocument(document: UserDocument): Promise<string> {
        const session = this.driver.session();
        try {
            const result = await session.run(
                `CREATE (d:User {
                    id: $id,
                    username: $username,
                    access_level: $access_level,
                    is_active: $is_active,
                    lastlog: $lastlog
                }) RETURN d.id as id`,
                {
                    id: document.id,
                    username: document.username,
                    access_level: document.access_level,
                    is_active: document.is_active,
                    lastlog: document.lastlog
                }
            );
            return result.records[0].get('id');
        } finally {
            await session.close();
        }
    }

    async addDocuments(documents: UserDocument[]): Promise<string[]> {
        const documentIds: string[] = [];
        for (const document of documents) {
            try {
                const id = await this.addDocument(document);
                documentIds.push(id);
                console.log(`Added document ${id}`);
            } catch (error) {
                console.error(`Failed to add document ${document.id}:`, error);
            }
        }
        return documentIds;
    }

    async createRelation(relation: UserRelation): Promise<void> {
        const session = this.driver.session();
        try {
            await session.run(
                `MATCH (user1:User {id: $user1Id}), (user2:User {id: $user2Id})
                CREATE (user1)-[r:KNOWS]->(user2)
                RETURN r`,
                {
                    user1Id: relation.user1_id,
                    user2Id: relation.user2_id
                }
            );
        } finally {
            await session.close();
        }
    }

    async addRelations(relations: UserRelation[]): Promise<void> {
        for (const relation of relations) {
            try {
                await this.createRelation(relation);
                console.log(`Created relation between ${relation.user1_id} and ${relation.user2_id}`);
            } catch (error) {
                console.error(`Failed to create relation between ${relation.user1_id} and ${relation.user2_id}:`, error);
            }
        }
    }

    // async getDocument(id: string): Promise<UserDocument | null> {
    //     const session = this.driver.session();
    //     try {
    //         const result = await session.run(
    //             'MATCH (d:User {id: $id}) RETURN d',
    //             { id: id }
    //         );
    //         if (result.records.length === 0) return null;
    //         return result.records[0].get('d').properties as UserDocument;
    //     } finally {
    //         await session.close();
    //     }
    // }

    // async getRelatedDocuments(id: string): Promise<Array<UserDocument>> {
    //     const session = this.driver.session();
    //     try {
    //         const result = await session.run(
    //             `MATCH (d:User {id: $id})-[r:KNOWS]->(related:User)
    //             RETURN related`,
    //             { id: id }
    //         );
    //         return result.records.map((record: Neo4jRecord) => 
    //             record.get('related').properties as UserDocument
    //         );
    //     } finally {
    //         await session.close();
    //     }
    // }

    async findShortestPath(name1: string, name2: string): Promise<string> {
        const session = this.driver.session();
        try {
            const result = await session.run(
                `MATCH (start:User {username: $name1}), (end:User {username: $name2})
                MATCH path = shortestPath((start)-[:KNOWS*]-(end))
                RETURN [node in nodes(path) | node.username] as usernames`,
                { name1, name2 }
            );
            
            if (result.records.length === 0) {
                throw new Error(`No path found between ${name1} and ${name2}`);
            }

            const usernames = result.records[0].get('usernames');
            return usernames.join(',');
        } finally {
            await session.close();
        }
    }

    async close(): Promise<void> {
        await this.driver.close();
    }
}

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

// Example usage:
async function main() {
    const url = process.env.CENTRALA_URL;
    const taskKey = process.env.TASKS_API_KEY;

    if (!url || !taskKey) {
        return Promise.reject(new Error('Environment variables are not set'));
    }

    const neo4jService = new Neo4jService();

    try {
        const isConnected = await neo4jService.verifyConnection();
        console.log('Connected to Neo4j:', isConnected);

        const users = await selectDB(url, taskKey, "select * from users")
        const connections = await selectDB(url, taskKey, "select * from connections")

        if (isConnected) {

            // Add all users first
            await neo4jService.addDocuments(users.reply);
            console.log('Added all users');

            // Then create all connections
            await neo4jService.addRelations(connections.reply);
            console.log('Added all connections');

            const pathRafalBarbara = await neo4jService.findShortestPath("Rafał", "Barbara");

            await neo4jService.close();

            await send_answer3("connections", pathRafalBarbara);
        }
    } catch (error) {
        console.error('Error:', error);
        await neo4jService.close();
    }
}

main().catch(console.error);
