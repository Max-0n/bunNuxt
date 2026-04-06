import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, posix } from 'node:path'
import imageSize from 'image-size'

type FileData = {
  size: number
  width?: number
  height?: number
}

const excludedExtensionsForSizeCheck = ['.skel', '.atlas', '.json']

const getFilesWithoutDate = async (dir: string, baseDir: string): Promise<Record<string, FileData>> => {
  const entries = await readdir(dir, { withFileTypes: true })
  const paths: Record<string, FileData> = {}

  for (const entry of entries) {
    const fullPath = posix.join(dir, entry.name)
    const relativePath = posix.relative(baseDir, fullPath)
    if (relativePath.includes('.DS_Store')) {
      console.warn('Найден .DS_Store файл:', relativePath)
      continue
    }
    if (entry.isDirectory()) {
      const subPaths = await getFilesWithoutDate(fullPath, baseDir)
      Object.assign(paths, subPaths)
    } else {
      const fileStats = await stat(fullPath)
      const { size } = fileStats

      const fileData: FileData = { size }

      const fileExtension = extname(entry.name).toLowerCase()
      if (!excludedExtensionsForSizeCheck.includes(fileExtension)) {
        try {
          const buffer = await readFile(fullPath)
          const dimensions = imageSize(buffer)
          if (dimensions.width && dimensions.height) {
            fileData.width = dimensions.width
            fileData.height = dimensions.height
          }
        } catch (error) {
          console.warn(`imageSize error: ${relativePath}`)
        }
      } else {
        fileData.width = 0
        fileData.height = 0
        console.log(`Skipping size check for file: ${relativePath}`)
      }

      paths[relativePath] = fileData
    }
  }

  return paths
}

const generateCdnFilesByFullPath = async () => {
  const baseDir = './static'
  const outputDir = 'generated'

  const paths = await getFilesWithoutDate(baseDir, baseDir)
  const cdnContent = `
export const generatedCdnFilesByFullPath = ${JSON.stringify(paths, null, 2)} as const
`
  await Bun.write(`${outputDir}/CdnFiles.ts`, cdnContent)
  console.log(`✅ Generated ${outputDir}/CdnFiles.ts`)
}

generateCdnFilesByFullPath().catch(console.error)
