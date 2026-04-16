const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis-mock');

const connection = new Redis();
const myQueue = new Queue('test', { connection });

async function run() {
    const job = await myQueue.add('test-job', { foo: 'bar' });
    console.log('Added job', job.id);
    
    const worker = new Worker('test', async (job) => {
        console.log('Processed job data:', job.data);
        return { success: true };
    }, { connection: new Redis() });
    
    await new Promise(r => setTimeout(r, 1000));
    console.log('Done');
    process.exit(0);
}

run().catch(console.error);
