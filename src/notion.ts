import { Client } from '@notionhq/client';
import type { BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints';
import { markdownToBlocks } from '@tryfabric/martian';

/**
 * Chunks an array into smaller arrays of specified size
 */
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Class for managing Notion client state and methods needed for the action.
 */
export class NotionApi {
  private client: Client;
  constructor(token: string) {
    this.client = new Client({
      auth: token,
    });
  }

  public async updatePageTitle(pageId: string, title: string) {
    await this.client.pages.update({
      page_id: pageId,
      properties: {
        title: {
          type: 'title',
          title: [
            {
              type: 'text',
              text: { content: title },
            },
          ],
        },
      },
    });
  }

  public async clearBlockChildren(blockId: string) {
    for await (const block of this.listChildBlocks(blockId)) {
      await this.client.blocks.delete({
        block_id: block.id,
      });
    }
  }

  /**
   * Convert markdown to the notion block data format and append it to an existing block.
   * FIXED: Now handles >100 blocks by chunking into batches of 100 (Notion API limit)
   * @param blockId Block which the markdown elements will be appended to.
   * @param md Markdown as string.
   * @param preamble Optional blocks to prepend before markdown content.
   */
  public async appendMarkdown(
    blockId: string,
    md: string,
    preamble: BlockObjectRequest[] = []
  ) {
    // Convert markdown to blocks
    const mdBlocks = markdownToBlocks(md);
    const allBlocks = [...preamble, ...mdBlocks];

    console.log(`Total blocks to append: ${allBlocks.length}`);

    // FIX: Chunk blocks into batches of 100 (Notion API limit)
    const chunks = chunkArray(allBlocks, 100);

    if (chunks.length > 1) {
      console.log(`Splitting into ${chunks.length} chunks of max 100 blocks each`);
    }

    // Append chunks sequentially
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`Appending chunk ${i + 1}/${chunks.length} (${chunk.length} blocks)...`);

      await this.client.blocks.children.append({
        block_id: blockId,
        children: chunk,
      });

      console.log(`✅ Successfully appended chunk ${i + 1}/${chunks.length}`);
    }
  }

  /**
   * Iterate over all of the childeren of a given block. This manages the underlying paginated API.
   * @param blockId Block being listed.
   * @param batchSize Number of childeren to fetch in each call to notion. Max 100.
   */
  public async *listChildBlocks(blockId: string, batchSize = 50) {
    let has_more = true;
    do {
      const blocks = await this.client.blocks.children.list({
        block_id: blockId,
        page_size: batchSize,
      });

      for (const block of blocks.results) {
        yield block;
      }

      has_more = blocks.has_more;
    } while (has_more);
  }
}

export interface NotionFrontmatter {
  notion_page: string;
  title?: string;
  [key: string]: unknown;
}

export function isNotionFrontmatter(fm: unknown): fm is NotionFrontmatter {
  const castFm = fm as NotionFrontmatter;
  return (
    typeof castFm?.notion_page === 'string' &&
    (typeof castFm?.title === 'string' || typeof castFm?.title === 'undefined')
  );
}
