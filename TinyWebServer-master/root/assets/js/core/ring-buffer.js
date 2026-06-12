/* AimScope fixed-size ring buffer. */
(function(window) {
  const AimScope = window.AimScope = window.AimScope || {};

class RingBuffer {
  constructor(cap) { this.buf = new Array(cap); this.head = 0; this.size = 0; this.cap = cap; }
  push(v) { this.buf[this.head] = v; this.head = (this.head + 1) % this.cap; if (this.size < this.cap) this.size++; }
  toArray() { if (!this.size) return []; if (this.size < this.cap) return this.buf.slice(0, this.size); const a = []; for (let i = 0; i < this.size; i++) a.push(this.buf[(this.head + i) % this.cap]); return a; }
  clear() { this.head = 0; this.size = 0; }
}

  AimScope.RingBuffer = RingBuffer;
})(window);
