import { paperRepository } from '../../repositories/paperRepository'
import { supabase } from '../supabase/client'
import type { Paper } from '../../types/paper'

export const paperFileService = {
  async load(paper: Paper) {
    const cached = await paperRepository.getFile(paper.id)
    if (cached) return cached
    if (!supabase || paper.filePath.startsWith('local://')) {
      throw new Error('本地 PDF 缓存不存在，且当前无法从云端恢复。')
    }
    const { data, error } = await supabase.storage.from('papers').download(paper.filePath)
    if (error) throw error
    await paperRepository.cacheFile(paper.id, data)
    return data
  },
}
