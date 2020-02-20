import {Readable, Writable, pipeline} from 'stream';
import {promisify} from 'util';

import {SyncTransform} from '../lib';

const pipe = promisify(pipeline);

describe('Syncthrough', () => {

    const chunk = Buffer.from('chunk');

    describe('pipe', () => {
        it('fails if multiple destinations are set', async () => {
            const st = new SyncTransform();
            const writable1 = new Writable({write: () => {}});
            const writable2 = new Writable({write: () => {}});
            st.pipe(writable1);
            expect(() => st.pipe(writable2)).toThrow('multiple pipe not allowed');
        });
        it('fails if destination is unset', async () => {
            const readable = new Readable({
                read: function () {
                    this.push(Buffer.from('chunk'));
                }
            });
            readable.push(Buffer.from('chunk'));
            const st = new SyncTransform();
            await expect(pipe(readable, st)).rejects.toThrow('Pipe destination unset');
        });
        it('forwards write events', async () => {
            const readable = new Readable({
                read: function () {
                    this.push(Buffer.from('chunk'));
                    this.push(null);
                }
            });
            let targetChunk = undefined;
            const writable = new Writable({write: (chunk) => { targetChunk = chunk }});
            const st = new SyncTransform();
            await pipe(readable, st, writable);
            expect(targetChunk).toEqual(chunk);
        });
    });

});
