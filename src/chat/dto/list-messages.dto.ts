export class ListMessagesDto {
  take?: string;   // default 50
  cursor?: string; // id del último mensaje para paginación
}
