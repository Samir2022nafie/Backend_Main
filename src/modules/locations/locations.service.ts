import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/core/database/prisma.service';
import { UpsertLocationDto, ResolveLocationInput } from './dto/upsert-location.dto';

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to resolve, find or create a location from ID, coordinates, or name.
   */
  async resolveLocation(input?: ResolveLocationInput | null): Promise<string | null> {
    if (!input) return null;

    const { locationId, locationName, latitude, longitude, placeId } = input;

    // 1. If explicit locationId passed, verify and return
    if (locationId) {
      const existing = await this.prisma.locations.findUnique({
        where: { id: locationId },
      });
      if (existing) return existing.id;
    }

    const trimmedName = locationName?.trim() || null;

    // 2. If coordinates are provided, find or upsert by [latitude, longitude]
    if (
      latitude !== undefined &&
      latitude !== null &&
      longitude !== undefined &&
      longitude !== null &&
      !isNaN(Number(latitude)) &&
      !isNaN(Number(longitude))
    ) {
      const lat = Number(Number(latitude).toFixed(6));
      const lng = Number(Number(longitude).toFixed(6));

      // Reject ocean / Null Island coordinates
      if (Math.abs(lat) < 0.5 && Math.abs(lng) < 0.5) {
        throw new BadRequestException('Invalid coordinates: Location cannot be placed on the ocean.');
      }

      // Try finding existing location by coordinate range / precision
      let existingLoc = await this.prisma.locations.findFirst({
        where: {
          latitude: lat,
          longitude: lng,
        },
      });

      if (!existingLoc) {
        existingLoc = await this.prisma.locations.findFirst({
          where: {
            latitude: { gte: lat - 0.00001, lte: lat + 0.00001 },
            longitude: { gte: lng - 0.00001, lte: lng + 0.00001 },
          },
        });
      }

      if (existingLoc) {
        if (trimmedName && existingLoc.place_name !== trimmedName) {
          await this.prisma.locations.update({
            where: { id: existingLoc.id },
            data: { place_name: trimmedName },
          });
        }
        return existingLoc.id;
      }

      try {
        const created = await this.prisma.locations.create({
          data: {
            place_name: trimmedName || 'Selected Location',
            latitude: lat,
            longitude: lng,
            place_id: placeId || null,
          },
        });
        return created.id;
      } catch (err: any) {
        if (
          err?.code === 'P2002' ||
          err?.message?.includes('Unique constraint') ||
          err?.message?.includes('uq_locations_coordinates')
        ) {
          const fallback = await this.prisma.locations.findFirst({
            where: {
              latitude: { gte: lat - 0.0001, lte: lat + 0.0001 },
              longitude: { gte: lng - 0.0001, lte: lng + 0.0001 },
            },
          });
          if (fallback) return fallback.id;
        }
        throw err;
      }
    }

    // 3. If only locationName was provided (user typed name without map pin)
    if (trimmedName) {
      const existingByName = await this.prisma.locations.findFirst({
        where: {
          place_name: { equals: trimmedName, mode: 'insensitive' },
        },
      });
      if (existingByName) return existingByName.id;

      // Create fallback location with slight offset (Null Island ocean, marked plain_text)
      const count = await this.prisma.locations.count();
      const fallbackLat = Number((0.0001 + (count % 10000) * 0.0001).toFixed(6));
      const fallbackLng = Number((0.0001 + (count % 10000) * 0.0001).toFixed(6));

      try {
        const created = await this.prisma.locations.create({
          data: {
            place_name: trimmedName,
            place_id: 'plain_text',
            latitude: fallbackLat,
            longitude: fallbackLng,
          },
        });
        return created.id;
      } catch (err: any) {
        if (
          err?.code === 'P2002' ||
          err?.message?.includes('Unique constraint') ||
          err?.message?.includes('uq_locations_coordinates')
        ) {
          const fallback = await this.prisma.locations.findFirst({
            where: {
              place_name: { equals: trimmedName, mode: 'insensitive' },
              place_id: 'plain_text',
            },
          });
          if (fallback) return fallback.id;
        }
        throw err;
      }
    }

    return null;
  }

  /**
   * Upsert a location by coordinates and name.
   */
  async upsert(dto: UpsertLocationDto) {
    const lat = Number(Number(dto.latitude).toFixed(6));
    const lng = Number(Number(dto.longitude).toFixed(6));

    let existing = await this.prisma.locations.findFirst({
      where: {
        latitude: { gte: lat - 0.00001, lte: lat + 0.00001 },
        longitude: { gte: lng - 0.00001, lte: lng + 0.00001 },
      },
    });

    if (existing) {
      if (existing.place_name !== dto.placeName || (dto.placeId && existing.place_id !== dto.placeId)) {
        return this.prisma.locations.update({
          where: { id: existing.id },
          data: {
            place_name: dto.placeName,
            place_id: dto.placeId ?? existing.place_id,
          },
        });
      }
      return existing;
    }

    try {
      return await this.prisma.locations.create({
        data: {
          place_name: dto.placeName,
          latitude: lat,
          longitude: lng,
          place_id: dto.placeId || null,
        },
      });
    } catch (err: any) {
      if (
        err?.code === 'P2002' ||
        err?.message?.includes('Unique constraint') ||
        err?.message?.includes('uq_locations_coordinates')
      ) {
        const fallback = await this.prisma.locations.findFirst({
          where: {
            latitude: { gte: lat - 0.0001, lte: lat + 0.0001 },
            longitude: { gte: lng - 0.0001, lte: lng + 0.0001 },
          },
        });
        if (fallback) return fallback;
      }
      throw err;
    }
  }

  /**
   * Find locations by place_name query.
   */
  async findAll(search?: string, limit = 20) {
    const where: any = {};
    if (search && search.trim()) {
      where.place_name = { contains: search.trim(), mode: 'insensitive' };
    }

    return this.prisma.locations.findMany({
      where,
      take: Math.min(limit, 50),
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Get all geo-located items for the Snapchat-style Explore Map.
   * Returns: communities, events, hangouts, and users who have coordinates.
   */
  async getExploreMapItems(viewerId?: string) {
    const isRealGeo = (loc: any) => {
      if (!loc) return false;
      if (loc.place_id === 'plain_text' || loc.placeId === 'plain_text') return false;
      const lat = Number(loc.latitude);
      const lng = Number(loc.longitude);
      if (isNaN(lat) || isNaN(lng)) return false;
      if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) return false;
      if (loc.place_name && loc.place_name.toLowerCase().trim() === 'online') return false;
      return true;
    };

    // 1. Communities with coordinates (exclude plain-text only)
    const communities = await this.prisma.communities.findMany({
      where: {
        deleted_at: null,
        location_id: { not: null },
        is_private: false,
      },
      include: {
        location: true,
        category: { select: { id: true, name: true } },
        _count: { select: { members: true } },
      },
      take: 200,
    });

    // 2. Events with coordinates (exclude plain-text only)
    const events = await this.prisma.events.findMany({
      where: {
        deleted_at: null,
        location_id: { not: null },
        approval_status: 'approved',
        visibility: 'public',
      },
      include: {
        location: true,
        community: {
          select: {
            id: true,
            name: true,
            slug: true,
            category: { select: { id: true, name: true } },
          },
        },
      },
      take: 200,
      orderBy: { starts_at: 'asc' },
    });

    // 3. Hangouts with coordinates (exclude plain-text only)
    const hangouts = await this.prisma.hangouts.findMany({
      where: {
        deleted_at: null,
        location_id: { not: null },
        visibility: 'public',
      },
      include: {
        location: true,
        category: { select: { id: true, name: true } },
        creator: {
          select: {
            id: true,
            username: true,
            name: true,
            first_name: true,
            profile_picture_url: true,
          },
        },
        _count: { select: { participants: true } },
      },
      take: 200,
      orderBy: { starts_at: 'asc' },
    });

    // 4. Users with coordinates (privacy-filtered, exclude plain-text only)
    const userWhere: any = {
      deleted_at: null,
      location_id: { not: null },
    };

    if (viewerId) {
      userWhere.OR = [
        { is_location_private: false },
        { id: viewerId },
      ];
    } else {
      userWhere.is_location_private = false;
    }

    const users = await this.prisma.users.findMany({
      where: userWhere,
      select: {
        id: true,
        username: true,
        name: true,
        first_name: true,
        last_name: true,
        profile_picture_url: true,
        trust_score: true,
        is_location_private: true,
        location: true,
      },
      take: 200,
    });

    return {
      communities: communities
        .filter((c) => isRealGeo(c.location))
        .map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          description: c.description,
          bannerUrl: c.banner_url,
          profilePictureUrl: c.profile_picture_url,
          category: c.category.name,
          memberCount: c._count.members,
          location: {
            id: c.location!.id,
            name: c.location!.place_name,
            placeName: c.location!.place_name,
            latitude: Number(c.location!.latitude),
            longitude: Number(c.location!.longitude),
            placeId: c.location!.place_id,
          },
        })),
      events: events
        .filter((e) => isRealGeo(e.location))
        .map((e) => ({
          id: e.id,
          title: e.title,
          description: e.description,
          coverImageUrl: e.cover_image_url,
          startsAt: e.starts_at,
          endsAt: e.ends_at,
          communityName: e.community.name,
          communitySlug: e.community.slug,
          category: e.community?.category?.name || 'general',
          location: {
            id: e.location!.id,
            name: e.location!.place_name,
            placeName: e.location!.place_name,
            latitude: Number(e.location!.latitude),
            longitude: Number(e.location!.longitude),
            placeId: e.location!.place_id,
          },
        })),
      hangouts: hangouts
        .filter((h) => isRealGeo(h.location))
        .map((h) => ({
          id: h.id,
          title: h.title,
          description: h.description,
          coverImageUrl: h.cover_image_url,
          startsAt: h.starts_at,
          endsAt: h.ends_at,
          joinType: h.join_type,
          maxParticipants: h.max_participants,
          participantCount: h._count.participants,
          category: h.category?.name || 'general',
          creator: {
            id: h.creator.id,
            username: h.creator.username,
            name: h.creator.name || h.creator.first_name,
            profilePictureUrl: h.creator.profile_picture_url,
          },
          location: {
            id: h.location!.id,
            name: h.location!.place_name,
            placeName: h.location!.place_name,
            latitude: Number(h.location!.latitude),
            longitude: Number(h.location!.longitude),
            placeId: h.location!.place_id,
          },
        })),
      users: users
        .filter((u) => isRealGeo(u.location))
        .map((u) => ({
          id: u.id,
          username: u.username,
          name: u.name || `${u.first_name} ${u.last_name || ''}`.trim(),
          profilePictureUrl: u.profile_picture_url,
          trustScore: u.trust_score,
          isPrivate: u.is_location_private,
          location: {
            id: u.location!.id,
            name: u.location!.place_name,
            placeName: u.location!.place_name,
            latitude: Number(u.location!.latitude),
            longitude: Number(u.location!.longitude),
            placeId: u.location!.place_id,
          },
        })),
    };
  }
}
