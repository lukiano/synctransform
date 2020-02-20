import * as crypto from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as stream from 'stream';

import {SyncTransform} from '../lib';

const iv = crypto.randomBytes(16);

function pbkdf2(password: string, aSalt: string): Buffer {
    return crypto.pbkdf2Sync(password, aSalt, 1, 32, 'SHA1');
}

const key = pbkdf2('my long password', 'my salt');

const filename = './chunk';

const server = new http.Server(async (req: http.IncomingMessage, res: http.ServerResponse) => {
    if (req.url === '/fast') {
        const data = fs.createReadStream(filename);
        const hash = crypto.createHash('SHA1');
        const hasher = new SyncTransform((chunk) => {
          hash.update(chunk);
          return chunk;
        });
        const cipher = crypto.createCipheriv('aes-256-cfb', key, iv);
        const cipherr = new SyncTransform((chunk) => {
            return cipher.update(chunk);
        });
        const blah = new SyncTransform();
        stream.pipeline(data, hasher, cipherr, blah, res, (err) => { if (err) console.log(err.message); });
    } else if (req.url === '/slow') {
        const data = fs.createReadStream(filename);
        const hash = crypto.createHash('SHA1');
        const hasher = new stream.Transform({
            transform: (chunk, _encoding, cb) => {
                hash.update(chunk);
                cb(undefined, chunk);
            }
        });
        const cipher = crypto.createCipheriv('aes-256-cfb', key, iv);
        const blah = new stream.PassThrough();
        stream.pipeline(data, hasher, cipher, blah, res, (err) => { if (err) console.log(err.message); });
    } else if (req.url === '/test') {
        const data = fs.createReadStream(filename);
        stream.pipeline(data, res, (err) => { if (err) console.log(err.message); });
    } else if (req.url === '/quick') {
        const data = fs.createReadStream(filename);
        const blah1 = new stream.PassThrough();
        const blah2 = new stream.PassThrough();
        const blah3 = new stream.PassThrough();
        const blah4 = new stream.PassThrough();
        stream.pipeline(data, blah1, blah2, blah3, blah4, res, (err) => { if (err) console.log(err.message); });
    } else if (req.url === '/quicker') {
        const data = fs.createReadStream(filename);
        const blah1 = new SyncTransform();
        const blah2 = new SyncTransform();
        const blah3 = new SyncTransform();
        const blah4 = new SyncTransform();
        stream.pipeline(data, blah1, blah2, blah3, blah4, res, (err) => { if (err) console.log(err.message); });
    } else if (req.url === '/quick-http-test') {
        const request = http.get('http://localhost:8081/test');
        request.on('response', (data) => {
            const blah1 = new stream.PassThrough();
            const blah2 = new stream.PassThrough();
            const blah3 = new stream.PassThrough();
            const blah4 = new stream.PassThrough();
            stream.pipeline(data, blah1, blah2, blah3, blah4, res, (err) => { if (err) console.log(err.message); });
        });
        request.on('error', (err) => {
           res.statusCode = 500;
           res.end(err.message);
        });
        request.end();
    } else if (req.url === '/quicker-http-test') {
        const request = http.get('http://localhost:8081/test');
        request.on('response', (data) => {
            const blah1 = new SyncTransform();
            const blah2 = new SyncTransform();
            const blah3 = new SyncTransform();
            const blah4 = new SyncTransform();
            stream.pipeline(data, blah1, blah2, blah3, blah4, res, (err) => { if (err) console.log(err.message); });
        });
        request.on('error', (err) => {
            res.statusCode = 500;
            res.end(err.message);
        });
        request.end();
    } else if (req.url === '/quickasync') {
        try {
            async function *pepe(): AsyncIterable<Buffer> {
                const rs = fs.createReadStream(filename);
                rs.pause();
                let chunk;
                let finished = false;
                while (!finished) {
                    const arr = new Array<Buffer>();
                    while (chunk !== null) {
                        chunk = rs.read();
                        if (chunk !== null) {
                            arr.push(chunk);
                        }
                    }
                    if (arr.length === 0) {
                        finished = await new Promise((resolve) => {
                            rs.once('readable', () => resolve(false));
                            rs.once('end', () => resolve(true));
                        });
                    } else {
                        yield Buffer.concat(arr);
                    }
                }
            }
            for await (const chunk of blah(blah(blah(blah(pepe()))))) {
                if (!res.write(chunk)) {
                    await new Promise((resolve) => {
                        res.once('drain', resolve);
                    });
                }
            }
            res.end();
        } catch (err) {
            res.destroy(err);
        }
    } else if (req.url === '/fastasync') {
        try {
            const hash = crypto.createHash('SHA1');
            const cipher = crypto.createCipheriv('aes-256-cfb', key, iv);
            for await (const chunk of blah(encrypt(hasher(fs.createReadStream(filename), hash), cipher))) {
                res.write(chunk);
            }
            res.end();
        } catch (err) {
            res.destroy(err);
        }
    } else {
        res.statusCode = 404;
        res.end();
    }
});

async function* hasher(source: AsyncIterable<Buffer>, hash: crypto.Hash): AsyncIterable<Buffer> {
    for await (const chunk of source) {
        hash.update(chunk);
        yield chunk;
    }
}

async function* blah(source: AsyncIterable<Buffer>): AsyncIterable<Buffer> {
    for await (const chunk of source) {
        yield chunk;
    }
}

async function* encrypt(source: AsyncIterable<Buffer>, cipher: crypto.Cipher): AsyncIterable<Buffer> {
    for await (const chunk of source) {
        yield cipher.update(chunk);
    }
}

const port = parseInt(process.argv[2] || '8080', 10);
server.listen(port, () => {
    console.log(`Listening on port ${port}`);
});
