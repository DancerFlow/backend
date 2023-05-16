import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateUserInfoDto } from './dto/update-userInfo.dto';
import * as bcrypt from 'bcryptjs';
@Injectable()
export class UserService {
  constructor(private prismaService: PrismaService) {}

  // 사용자 프로필 조회
  async findUser(userId: number): Promise<object> {
    const foundUser = await this.prismaService.user.findUnique({
      where: { id: userId },
      include: { user_auth: true, user_info: true },
    });
    const { id, user_auth, user_info } = foundUser;
    const { nickname, profile_image_url, xp } = user_info;
    const { email } = user_auth;
    return { id, nickname, email, profile_image_url, xp };
  }

  // 사용자 정보 수정
  async updateUserInfo(userId: number, updateUserInfoDto: UpdateUserInfoDto) {
    const { nickname, current_password, new_password } = updateUserInfoDto;
    if (nickname) {
      if (
        await this.prismaService.user_info.findUnique({ where: { nickname } })
      ) {
        throw new UnauthorizedException(`${nickname} is already exist.`);
      }

      await this.prismaService.user_info.update({
        where: { user_id: userId },
        data: {
          ...(nickname && { nickname }),
        },
      });
    }

    if (current_password && new_password) {
      const foundUserAuth = await this.prismaService.user_auth.findUnique({
        where: { user_id: userId },
      });

      if (await bcrypt.compare(current_password, foundUserAuth.password)) {
        const salt = await bcrypt.genSalt();
        if (current_password === new_password) {
          throw new UnauthorizedException('password not match');
        }
        const hashedPassword = await bcrypt.hash(new_password, salt);
        await this.prismaService.user_auth.update({
          where: { user_id: userId },
          data: { password: hashedPassword },
        });
      } else {
        throw new UnauthorizedException('password not match');
      }
    }
    return 'request success';
  }

  // 사용자 프로필 이미지 수정(업로드)
  async uploadUserProfileImage(userId: number, file: Express.MulterS3.File) {
    if (!file) {
      throw new BadRequestException('there is no files');
    }
    const filePath = file.location;
    await this.prismaService.user_info.update({
      where: { user_id: userId },
      data: {
        profile_image_url: filePath,
      },
    });
    return { filePath };
  }

  // 사용자 캘린더 조회
  async findCalendar(
    userId: number,
    year: string,
    month: string,
  ): Promise<object[]> {
    return await this.prismaService.user_play_log.findMany({
      where: {
        user_id: userId,
        created_at: {
          gte: new Date(`${year}-${+month}-01`),
          lt: new Date(
            `${+month + 1 > 12 ? +year + 1 : year}-${
              +month + 1 > 12 ? '01' : +month + 1
            }-01`,
          ),
        },
      },
      distinct: ['created_at'],
      orderBy: { created_at: 'asc' },
      select: { created_at: true },
    });
  }

  // 사용자 찜 리스트 조회
  async findLikes(userId: number, pageno: number): Promise<any> {
    let total_length;
    let maxPage = 1;
    const perPage = 5;
    await this.prismaService.user_likes
      .findMany({
        where: { user_id: userId },
      })
      .then(data => (total_length = data.length));
    maxPage = Math.ceil(total_length / perPage);
    pageno = pageno > maxPage ? maxPage : pageno;
    const userLikes = await this.prismaService.user_likes.findMany({
      where: { user_id: userId },
      ...(pageno > 0 && { take: perPage }),
      ...(pageno > 0 && { skip: (pageno - 1) * perPage }),
      include: {
        music: {
          include: { music_singer: { select: { name: true } } },
        },
      },
    });

    return { userLikes, maxPage };
  }

  // 최근 플레이한 리스트
  async findAllGameHistory(userId: number, pageno: number) {
    const historyList = [];
    let maxPage = 1;
    await this.prismaService.user_score
      .groupBy({
        by: ['music_id'],
        where: { user_id: userId },
      })
      .then(async data => {
        const total_length = data.length;
        maxPage = Math.ceil(total_length / 5);
        pageno = pageno > maxPage ? maxPage : pageno;
        for (let i = 0; i < 5; i++) {
          const idx = i + (pageno - 1) * 5;
          if (idx + 1 > data.length) break;
          const music_id = data[idx].music_id;
          const { name, album_image_url, music_singer } =
            await this.prismaService.music.findUnique({
              where: { id: music_id },
              include: { music_singer: true },
            });
          const { total_score } =
            await this.prismaService.music_answer.findUnique({
              where: { music_id },
            });
          const { score } = await this.prismaService.user_score.findFirst({
            where: { user_id: userId, music_id },
            orderBy: { score: 'desc' },
          });
          historyList.push({
            music_id,
            music_name: name,
            album_image_url,
            music_singer: music_singer.name,
            user_music_best_score: score,
            music_total_score: total_score,
          });
        }
      });
    return { historyList, maxPage };
  }

  // 히스토리 세부 정보
  async findOneGameHistory(userId: number, musicId: number) {
    const historyList = [];
    let result = {};

    await this.prismaService.user_score
      .findMany({
        where: { user_id: userId, music_id: musicId },
        orderBy: { score: 'desc' },
        distinct: ['created_at'],
      })
      .then(async data => {
        if (data.length > 0) {
          const { id, music_id, score } = data[0];
          const found = await this.prismaService.user_score.groupBy({
            by: ['user_id'],
            _max: { score: true },
            where: { music_id: id },
            orderBy: { _max: { score: 'desc' } },
          });
          const rank = found.findIndex(value => value.user_id === userId) + 1;

          const { perfect, good, miss } =
            await this.prismaService.user_score_detail.findUnique({
              where: { score_id: id },
            });
          const { total_score } =
            await this.prismaService.music_answer.findUnique({
              where: { music_id },
            });
          for (let i = 0; i < data.length; i++) {
            const { score, created_at } = data[i];

            historyList.push({
              music_score: score,
              music_score_created_at: created_at,
            });
          }
          result = {
            music_id,
            music_best_score_detail: { score, rank, perfect, good, miss },
            music_total_score: total_score,
            music_score_list: historyList.sort(
              (a, b) =>
                a['music_score_created_at'] - b['music_score_created_at'],
            ),
          };
        }
      });
    return result;
  }
}
