// Página de inicio del proxy: cambia los textos y pon una caja por servicio.
// Al añadir un servicio: su entrada aquí, su imagen en img/ y su bloque en nginx.conf.
// "ruta" es el enlace de la caja:
//   - servicio publicado por ruta:       ruta: '/code/'
//   - servicio publicado por subdominio: ruta: 'http://kuma.localhost/'  (la URL completa)
const PORTAL = {
  titulo: 'Mi servidor',
  subtitulo: 'Reverse proxy con nginx y Docker',
  pie: 'Práctica de reverse proxy · cambia este texto por tu nombre',
};

const APPS = [
  {
    nombre: 'Code Server',
    ruta: '/code/',                    // la misma ruta que su "location" en nginx.conf
    imagen: 'img/code.svg',
    descripcion: 'VS Code en el navegador',
  },
  {
    nombre: 'Portainer',
    ruta: '/portainer/',
    imagen: 'img/portainer.svg',
    descripcion: 'Gestión de contenedores Docker',
  },
  // ↓ Añade aquí las cajas nuevas, antes del ]; que cierra la lista
];
