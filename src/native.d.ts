/** API главного процесса, проброшенное через preload (electron/preload.cjs). */
interface NativeApi {
  openBundleDialog(): Promise<string | null>;
  openFileDialog(title: string, extensions: string[]): Promise<string | null>;
  saveBundleDialog(defaultPath: string): Promise<string | null>;
  pickDirDialog(title: string): Promise<string | null>;

  readFile(path: string): Promise<ArrayBuffer>;
  writeFile(path: string, data: ArrayBuffer): Promise<void>;
  mkdir(path: string): Promise<void>;
  tempDir(): Promise<string>;
  showInFolder(path: string): Promise<void>;

  ffmpegCheck(): Promise<string | null>;
  ffmpegRun(args: string[]): Promise<{ code: number; stderr: string }>;
  ffmpegStart(args: string[]): Promise<number>;
  ffmpegWrite(id: number, chunk: ArrayBuffer): Promise<void>;
  ffmpegClose(id: number): Promise<{ code: number; stderr: string }>;
  ffmpegKill(id: number): Promise<void>;
}

declare const native: NativeApi;
