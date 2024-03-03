import { Injectable } from '@angular/core';
import {
  Camera,
  CameraResultType,
  CameraSource,
  Photo,
} from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { IUserPhoto } from '../interfaces/UserPhoto';
import { Platform } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';

@Injectable({
  providedIn: 'root',
})
export class PhotoService {
  constructor(platform: Platform) {
    this.platform = platform;
  }

  public photos: IUserPhoto[] = [];
  private PHOTO_STORAGE: string = 'photos';
  private platform: Platform;

  //Método para abrir a camera e tirar fotos
  public async addNewToGallery() {
    const capturedPhoto = await Camera.getPhoto({
      resultType: CameraResultType.Uri, // dados baseados em arquivo, proporciona melhor desempenho
      source: CameraSource.Camera, // tira automaticamente uma nova foto com a câmera
      quality: 100, // qualidade mais alta (0 a 100)
    });
    //Salve a imagem e adicione-a à coleção de fotos
    const savedImageFile = await this.savePicture(capturedPhoto);
    this.photos.unshift(savedImageFile);
    //Salva as fotos tiradas no armazenamento
    Preferences.set({
      key: this.PHOTO_STORAGE,
      value: JSON.stringify(this.photos),
    });
  }

  public async loadSaved() {
    // Recupera dados de array de fotos em cache
    const { value } = await Preferences.get({ key: this.PHOTO_STORAGE });
    this.photos = value ? JSON.parse(value) : [];
    // Maneira de detectar quando estiver executando na web:"quando a plataforma NÃO for híbrida, faça isso"
    if (!this.platform.is('hybrid')) {
      // Exibe a foto lendo no formato base64
      for (let photo of this.photos) {
        // Ler os dados de cada foto salva no sistema de arquivos
        const readFile = await Filesystem.readFile({
          path: photo.filepath,
          directory: Directory.Data,
        });
        // Somente plataforma Web: Carrega a foto como dados base64
        photo.webviewPath = `data:image/jpeg;base64,${readFile.data}`;
      }
    }
  }

  private async savePicture(photo: Photo) {
    // Converte a foto para o formato base64, exigido pela API do capacitor/filesystem de arquivos para salvar
    const base64Data = await this.readAsBase64(photo);
    // Grava o arquivo no diretório de dados
    const fileName = Date.now() + '.jpeg';
    const savedFile = await Filesystem.writeFile({
      path: fileName,
      data: base64Data,
      directory: Directory.Data,
    });
    if (this.platform.is('hybrid')) {
      // Exibe a nova imagem reescrevendo o caminho 'file://' para HTTP
      // Detalhes: https://ionicframework.com/docs/building/webview#file-protocol
      return {
        filepath: savedFile.uri,
        webviewPath: Capacitor.convertFileSrc(savedFile.uri),
      };
    } else {
      // Use webPath para exibir a nova imagem em vez de base64, pois é já carregado na memória
      return {
        filepath: fileName,
        webviewPath: photo.webPath,
      };
    }
    // Use webPath para exibir a nova imagem em vez de base64, pois é já carregado na memória
    return {
      filepath: fileName,
      webviewPath: photo.webPath,
    };
  }

  /**
   * Lê uma foto como base64 a partir do caminho da web fornecido.
   * @param photo - Objeto Photo contendo o caminho da web da foto a ser lida.
   * @returns Uma Promise que resolve para uma string ou blob contendo a representação base64 da foto.
   */
  private async readAsBase64(photo: Photo): Promise<string | Blob> {
    // "híbrido" detectará Cordova ou Capacitor
    if (this.platform.is('hybrid')) {
      try {
        //Leia o arquivo no formato base64
        const file = await Filesystem.readFile({
          path: photo.path!,
        });
        return file.data;
      } catch (error) {
        // Lida com erros durante o processo de leitura.
        console.error('Erro ao ler a foto como base64:', error);
        throw error; // Pode ser modificado para lidar com o erro de outra forma, se necessário.
      }
    } else {
      try {
        // Realiza uma requisição para obter o conteúdo da foto no caminho da web.
        const res = await fetch(photo.webPath!);
        // Obtém o conteúdo da resposta como um Blob.
        const blob = await res.blob();
        // Converte o Blob para base64 e retorna o resultado como uma string.
        return await this.convertBlobToBase64(blob);
      } catch (error) {
        // Lida com erros durante o processo de leitura.
        console.error('Erro ao ler a foto como base64:', error);
        throw error; // Pode ser modificado para lidar com o erro de outra forma, se necessário.
      }
    }
  }

  /**
   * Converte um Blob para uma representação base64.
   * @param blob - Objeto Blob contendo os dados a serem convertidos.
   * @returns Uma Promise que resolve para uma string contendo a representação base64 do Blob.
   */
  private convertBlobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      // Cria um objeto FileReader para ler o conteúdo do Blob.
      const reader = new FileReader();
      // Configura a função de tratamento de erro do leitor.
      reader.onerror = reject;
      // Configura a função a ser chamada quando a leitura for concluída.
      reader.onload = () => resolve(reader.result as string);
      // Inicia a leitura do Blob como uma URL de dados (base64).
      reader.readAsDataURL(blob);
    });

  public async deletePicture(photo: IUserPhoto, position: number) {
    // Remove esta foto do array de dados de referência de Fotos
    this.photos.splice(position, 1);
    //Atualiza o cache do array de fotos substituindo o array de fotos existente
    Preferences.set({
      key: this.PHOTO_STORAGE,
      value: JSON.stringify(this.photos),
    });
    //exclui o arquivo de foto do sistema de arquivos
    const filename = await photo.filepath.substring(
      photo.filepath.lastIndexOf('/') + 1
    );

    await Filesystem.deleteFile({
      path: filename,
      directory: Directory.Data,
    });
  }
}
