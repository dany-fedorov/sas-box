import { SasBox } from '../../dist/index';

const promiseBox = SasBox.Unknown.fromSync(() => Promise.resolve(42));
const incorrectlyNested: Promise<Promise<number>> = promiseBox.async();

const asyncOnly = SasBox.Unknown.fromAsync(async () => 42);
asyncOnly.sync();

new SasBox.Unknown(() => 42, async () => 'wrong');

void incorrectlyNested;
