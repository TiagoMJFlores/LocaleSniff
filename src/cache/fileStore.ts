import { promises as fs } from 'node:fs';
import path from 'node:path';

interface Envelope<T> {
  createdAt: string;
  value: T;
}

export class FileCache {
  constructor(private readonly dir: string) {}

  private filePathFor(key: string): string {
    const prefix = key.slice(0, 2);
    return path.join(this.dir, prefix, key + '.json');
  }

  async get<T>(key: string): Promise<T | undefined> {
    const p = this.filePathFor(key);
    try {
      const raw = await fs.readFile(p, 'utf8');
      const env = JSON.parse(raw) as Envelope<T>;
      return env.value;
    } catch {
      return undefined;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    const p = this.filePathFor(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    const envelope: Envelope<T> = { createdAt: new Date().toISOString(), value };
    await fs.writeFile(p, JSON.stringify(envelope), 'utf8');
  }
}
