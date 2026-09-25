import { ErrorCode } from '../enums';

export interface ApiResponseMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: ApiResponseMeta;
}

export interface ApiErrorDetail {
  field?: string;
  message: string;
  [key: string]: any;
}

export interface ApiErrorPayload {
  code: ErrorCode | string;
  message: string;
  details?: ApiErrorDetail[] | any[];
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorPayload;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface RequestUser {
  id: string;
  username: string;
  email: string | null;
  phoneNumber: string | null;
  firstName: string;
  lastName?: string | null;
  trustScore: number;
  [key: string]: any;
}
