import { describe, expect, it } from 'vitest';
import { shouldScanFile } from '../../src/detect/fileFilter.js';
import { pathToPlatform } from '../../src/detect/platform.js';

describe('shouldScanFile', () => {
  it('allows iOS source files', () => {
    expect(shouldScanFile('App/Login.swift')).toBe(true);
    expect(shouldScanFile('Legacy/AppDelegate.m')).toBe(true);
    expect(shouldScanFile('Legacy/Wrapper.mm')).toBe(true);
  });

  it('allows Android source files', () => {
    expect(shouldScanFile('app/src/main/java/com/x/Login.kt')).toBe(true);
    expect(shouldScanFile('app/src/main/java/com/x/Login.java')).toBe(true);
  });

  it('allows Android resource XML only under res/', () => {
    expect(shouldScanFile('app/src/main/res/values/strings.xml')).toBe(true);
    expect(shouldScanFile('app/src/main/res/layout/login.xml')).toBe(true);
  });

  it('rejects XML outside res/', () => {
    expect(shouldScanFile('project.pbxproj')).toBe(false);
    expect(shouldScanFile('AndroidManifest.xml')).toBe(false);
    expect(shouldScanFile('config/settings.xml')).toBe(false);
  });

  it('rejects unrelated files', () => {
    expect(shouldScanFile('README.md')).toBe(false);
    expect(shouldScanFile('package.json')).toBe(false);
    expect(shouldScanFile('src/index.ts')).toBe(false);
  });
});

describe('pathToPlatform', () => {
  it('classifies iOS', () => {
    expect(pathToPlatform('Login.swift')).toBe('ios');
    expect(pathToPlatform('App.m')).toBe('ios');
    expect(pathToPlatform('Bridge.mm')).toBe('ios');
  });

  it('classifies Android', () => {
    expect(pathToPlatform('Login.kt')).toBe('android');
    expect(pathToPlatform('Login.java')).toBe('android');
    expect(pathToPlatform('app/src/main/res/values/strings.xml')).toBe('android');
  });

  it('returns null for unknown', () => {
    expect(pathToPlatform('index.ts')).toBeNull();
    expect(pathToPlatform('README.md')).toBeNull();
  });
});
