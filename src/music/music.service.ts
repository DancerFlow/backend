import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { music } from '@prisma/client';
import now = jest.now;
import { timestamp } from 'rxjs';
import { UpdateMusicDto } from './dto/update-music.dto';

@Injectable()
export class MusicService {
  constructor(private prisma: PrismaService) {}

  async getAll() {
    const musics = await this.prisma.music.findMany({
      where: { deleted_at: null },
      select: {
        id: true,
        name: true,
        music_genre: { select: { id: true, name: true } },
        music_singer: { select: { id: true, name: true } },
        album_image_url: true,
      },
    });
    return musics;
  }

  async getOne(id: number) {
    const musicInfo = await this.prisma.music.findMany({
      where: { id, deleted_at: null }, // findUnqiue에서 deleted_at:null 추가하면 왜 안 되지?
      select: {
        id: true,
        name: true,
        music_genre: { select: { id: true, name: true } },
        music_singer: { select: { id: true, name: true } },
        album_image_url: true,
        description: true,
        likes: true,
        played: true,
        // user_is_like는 어떻게 집어넣지??
      },
    });
    // 나중에 에러처리 따로 빼주기
    if (!musicInfo) {
      throw new NotFoundException('해당 곡 정보를 찾을 수 없습니다.');
    }
    return musicInfo;
  }

  // async create(musicData)

  async patch(id: number, updateData: UpdateMusicDto) {
    await this.getOne(id);
    await this.prisma.music.update({
      where: { id },
      data: updateData,
    });
    return;
  }

  async remove(id: number) {
    const musicInfo = await this.getOne(id);
    await this.prisma.music.update({
      where: { id },
      data: {
        deleted_at: new Date(),
        name: musicInfo[0].name + ':' + new Date(),
      },
    });
    return;
  }

  async like(id: number) {
    await this.getOne(id);
    await this.prisma.music.update({
      where: { id },
      data: { likes: { increment: 1 } },
    });
  }

  async unlike(id: number) {
    await this.getOne(id);
    await this.prisma.music.update({
      where: { id },
      data: { likes: { decrement: 1 } },
    });
  }
}
