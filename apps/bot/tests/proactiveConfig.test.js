// Testy konfiguracji trybu proaktywnego

describe('proactive config', () => {
  const original = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...original };
  });

  afterAll(() => {
    process.env = original;
  });

  describe('isProactiveEnabled', () => {
    it('zwraca true gdy ENABLE_PROACTIVE=true', () => {
      process.env.ENABLE_PROACTIVE = 'true';
      const { isProactiveEnabled } = require('../src/proactive/config');
      expect(isProactiveEnabled()).toBe(true);
    });

    it('zwraca false gdy ENABLE_PROACTIVE nie jest ustawione', () => {
      delete process.env.ENABLE_PROACTIVE;
      const { isProactiveEnabled } = require('../src/proactive/config');
      expect(isProactiveEnabled()).toBe(false);
    });

    it('zwraca false gdy ENABLE_PROACTIVE=false', () => {
      process.env.ENABLE_PROACTIVE = 'false';
      const { isProactiveEnabled } = require('../src/proactive/config');
      expect(isProactiveEnabled()).toBe(false);
    });
  });

  describe('getProactiveChannelNames', () => {
    it('parsuje kanały z env var', () => {
      process.env.PROACTIVE_CHANNELS = 'general,team,random';
      const { getProactiveChannelNames } = require('../src/proactive/config');
      expect(getProactiveChannelNames()).toEqual(['general', 'team', 'random']);
    });

    it('trimuje spacje', () => {
      process.env.PROACTIVE_CHANNELS = ' general , team ';
      const { getProactiveChannelNames } = require('../src/proactive/config');
      expect(getProactiveChannelNames()).toEqual(['general', 'team']);
    });

    it('zwraca pustą tablicę gdy brak env var', () => {
      delete process.env.PROACTIVE_CHANNELS;
      const { getProactiveChannelNames } = require('../src/proactive/config');
      expect(getProactiveChannelNames()).toEqual([]);
    });

    it('zwraca pustą tablicę gdy pusty string', () => {
      process.env.PROACTIVE_CHANNELS = '';
      const { getProactiveChannelNames } = require('../src/proactive/config');
      expect(getProactiveChannelNames()).toEqual([]);
    });
  });

  describe('getProactiveConfig', () => {
    it('zwraca domyślne wartości', () => {
      const { getProactiveConfig } = require('../src/proactive/config');
      const config = getProactiveConfig();
      expect(config.threadThreshold).toBe(5);
      expect(config.channelMessageInterval).toBe(15);
      expect(config.confidenceThreshold).toBe(0.7);
      expect(config.globalMaxPerHour).toBe(10);
      expect(config.threadCooldownMinutes).toBe(60);
      expect(config.channelCooldownMinutes).toBe(30);
    });

    it('parsuje wartości z env vars', () => {
      process.env.PROACTIVE_THREAD_THRESHOLD = '10';
      process.env.PROACTIVE_CHANNEL_MESSAGE_INTERVAL = '20';
      process.env.PROACTIVE_CONFIDENCE_THRESHOLD = '0.8';
      process.env.PROACTIVE_GLOBAL_MAX_PER_HOUR = '5';
      process.env.PROACTIVE_THREAD_COOLDOWN_MINUTES = '120';
      process.env.PROACTIVE_CHANNEL_COOLDOWN_MINUTES = '45';
      const { getProactiveConfig } = require('../src/proactive/config');
      const config = getProactiveConfig();
      expect(config.threadThreshold).toBe(10);
      expect(config.channelMessageInterval).toBe(20);
      expect(config.confidenceThreshold).toBe(0.8);
      expect(config.globalMaxPerHour).toBe(5);
      expect(config.threadCooldownMinutes).toBe(120);
      expect(config.channelCooldownMinutes).toBe(45);
    });

    it('fallbackuje na defaults przy złych wartościach', () => {
      process.env.PROACTIVE_THREAD_THRESHOLD = 'abc';
      process.env.PROACTIVE_CONFIDENCE_THRESHOLD = 'xyz';
      const { getProactiveConfig } = require('../src/proactive/config');
      const config = getProactiveConfig();
      expect(config.threadThreshold).toBe(5);
      expect(config.confidenceThreshold).toBe(0.7);
    });
  });
});
