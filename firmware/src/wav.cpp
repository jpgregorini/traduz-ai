#include "wav.h"

// Escreve um inteiro little-endian em out[offset..].
static void wr16(uint8_t* o, uint16_t v) { o[0] = v & 0xff; o[1] = (v >> 8) & 0xff; }
static void wr32(uint8_t* o, uint32_t v) {
  o[0] = v & 0xff; o[1] = (v >> 8) & 0xff; o[2] = (v >> 16) & 0xff; o[3] = (v >> 24) & 0xff;
}

size_t writeWavHeader(uint8_t* out, uint32_t numSamples, uint32_t sampleRate) {
  const uint32_t dataBytes = numSamples * 2; // 16-bit mono
  // RIFF
  out[0]='R'; out[1]='I'; out[2]='F'; out[3]='F';
  wr32(out + 4, 36 + dataBytes);
  out[8]='W'; out[9]='A'; out[10]='V'; out[11]='E';
  // fmt
  out[12]='f'; out[13]='m'; out[14]='t'; out[15]=' ';
  wr32(out + 16, 16);            // tamanho do bloco fmt
  wr16(out + 20, 1);             // PCM
  wr16(out + 22, 1);             // mono
  wr32(out + 24, sampleRate);
  wr32(out + 28, sampleRate * 2); // byte rate (mono 16-bit)
  wr16(out + 32, 2);             // block align
  wr16(out + 34, 16);            // bits por amostra
  // data
  out[36]='d'; out[37]='a'; out[38]='t'; out[39]='a';
  wr32(out + 40, dataBytes);
  return 44;
}
