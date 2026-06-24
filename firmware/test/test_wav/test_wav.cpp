#include <unity.h>
#include <cstdint>
#include "../../src/wav.h"

void test_header_tem_44_bytes(void) {
  uint8_t buf[44];
  size_t n = writeWavHeader(buf, 16000, 16000); // 16000 amostras, 16 kHz
  TEST_ASSERT_EQUAL_UINT(44, n);
}

void test_magic_riff_e_wave(void) {
  uint8_t buf[44];
  writeWavHeader(buf, 100, 16000);
  TEST_ASSERT_EQUAL_MEMORY("RIFF", buf, 4);
  TEST_ASSERT_EQUAL_MEMORY("WAVE", buf + 8, 4);
  TEST_ASSERT_EQUAL_MEMORY("data", buf + 36, 4);
}

void test_campos_pcm_mono_16bit(void) {
  uint8_t buf[44];
  uint32_t samples = 100;
  uint32_t rate = 16000;
  writeWavHeader(buf, samples, rate);
  auto u16 = [&](int o){ return (uint16_t)(buf[o] | (buf[o+1] << 8)); };
  auto u32 = [&](int o){ return (uint32_t)(buf[o] | (buf[o+1]<<8) | (buf[o+2]<<16) | ((uint32_t)buf[o+3]<<24)); };
  TEST_ASSERT_EQUAL_UINT16(1, u16(20));            // PCM
  TEST_ASSERT_EQUAL_UINT16(1, u16(22));            // mono
  TEST_ASSERT_EQUAL_UINT32(rate, u32(24));         // sample rate
  TEST_ASSERT_EQUAL_UINT32(rate * 2, u32(28));     // byte rate
  TEST_ASSERT_EQUAL_UINT16(2, u16(32));            // block align
  TEST_ASSERT_EQUAL_UINT16(16, u16(34));           // bits/sample
  TEST_ASSERT_EQUAL_UINT32(samples * 2, u32(40));  // data size
  TEST_ASSERT_EQUAL_UINT32(36 + samples * 2, u32(4)); // RIFF chunk size
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_header_tem_44_bytes);
  RUN_TEST(test_magic_riff_e_wave);
  RUN_TEST(test_campos_pcm_mono_16bit);
  return UNITY_END();
}
