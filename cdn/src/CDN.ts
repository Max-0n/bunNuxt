import { generatedCdnFilesByFullPath } from '../generated/CdnFiles'

export type CdnFilePaths = keyof typeof generatedCdnFilesByFullPath

export class CDN {
  private baseUrl: string

  private constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  public static create(baseUrl: string): CDN {
    return new CDN(baseUrl)
  }

  /**
   * Для поддержки нового файла необходимо:
   * 1. Зайди в директорию cdn
   * 2. В директории static разместить новые файлы
   * 3. Затем выполнить команду: bun gen
   * 4. После этого метод cdn.url('path/img.jpg') должен заработать
   * подробнее см в cdn/README.md
   */
  public url<T extends CdnFilePaths>(path: T): string {
    return `${this.baseUrl}/${path}`
  }

  public info<T extends CdnFilePaths>(path: T) {
    const fileInfo = generatedCdnFilesByFullPath[path]
    if (!fileInfo) {
      throw new Error(`File not found '${path}'`)
    }

    const url = this.url(path)
    const { size, width, height } = fileInfo
    return { url, size, width, height }
  }
}
