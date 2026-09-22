import { paperRepository } from '../../repositories/paperRepository'
import type { Paper } from '../../types/paper'

export const paperFileService = {
  async load(paper: Paper) {
    const cached = await paperRepository.getFile(paper.id)
    if (cached) return cached
    throw new Error('本地 PDF 文件不存在。请从备份恢复，或重新导入这篇论文。')
  },
}
