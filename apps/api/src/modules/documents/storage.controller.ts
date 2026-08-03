import { Controller, Get, Put, Query, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { InvalidInputException, ResourceNotFoundException } from '../../common/errors/app.exception';
import { LocalDiskStorageService } from '../../infrastructure/storage/local-disk-storage.service';
import { Public } from '../identity/decorators/public.decorator';

/**
 * DEVELOPMENT ONLY — the local stand-in for object storage.
 *
 * @Public() because the caller presents a SIGNED URL, not a bearer token. That
 * is exactly how S3 presigned URLs work: the signature IS the authorisation,
 * which is what lets a browser upload directly without ever holding a
 * long-lived credential.
 *
 * Excluded from Swagger: this endpoint does not exist in production, and
 * documenting it would imply otherwise.
 */
@ApiExcludeController()
@Controller('storage')
export class StorageController {
  constructor(private readonly storage: LocalDiskStorageService) {}

  @Public()
  @Put('upload')
  async upload(
    @Query('key') key: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    this.storage.verify('upload', key, expires, signature);

    const body: unknown = req.body;

    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new InvalidInputException('Request body must be the raw file bytes');
    }

    await this.storage.write(key, body);

    // 200 with the byte count so the client can pass it to the confirm step.
    res.status(200).json({ sizeBytes: body.length });
  }

  @Public()
  @Get('download')
  async download(
    @Query('key') key: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
    @Res() res: Response,
  ): Promise<void> {
    this.storage.verify('download', key, expires, signature);

    const absolutePath = this.storage.resolveInsideRoot(key);

    await new Promise<void>((resolve, reject) => {
      res.sendFile(
        absolutePath,
        {
          // Express defaults to dotfiles:'ignore', which 404s any path
          // containing a dot-prefixed segment — a sensible default for static
          // file servers (it hides .env, .git, .ssh). Our development storage
          // root is `.storage`, so we must opt in. The path is one we resolved
          // ourselves and already checked stays inside the storage root; it is
          // never taken from the request.
          dotfiles: 'allow',
        },
        (error) => (error ? reject(error) : resolve()),
      );
    }).catch(() => {
      // A signature that verified but a file that is gone means the metadata
      // and the bytes have diverged. 404 is the honest answer; the opaque 500
      // it produced before told the caller nothing.
      throw new ResourceNotFoundException('File', key);
    });
  }
}
