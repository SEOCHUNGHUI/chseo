export interface Container {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string;
}

export interface User {
  id: number;
  username: string;
}
