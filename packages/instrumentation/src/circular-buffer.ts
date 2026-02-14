export class CircularBuffer<T> {
  private readonly values: T[];
  private readonly maxSize: number;

  public constructor(maxSize: number) {
    this.maxSize = Math.max(1, maxSize);
    this.values = [];
  }

  public push(value: T): void {
    this.values.push(value);
    if (this.values.length > this.maxSize) {
      this.values.shift();
    }
  }

  public clear(): void {
    this.values.length = 0;
  }

  public toArray(): T[] {
    return [...this.values];
  }

  public get size(): number {
    return this.values.length;
  }
}
