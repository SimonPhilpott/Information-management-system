// Homebrew (beta): the Material 3 building blocks - icons, buttons, chips, text fields, tabs, sheets, menus,
// dialogs, snackbars - and the small motion hooks they share. Styles are in hbb.css.
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { glossMatches } from '../Dashboard/brewGlossary';
import { ABBR, abbrMatches } from './brewData';

// ---- icons: Material Symbols (filled, 24dp). class "fill-current" keeps IMS's global outline-icon rule off them ----
const P = {
  // the Run planner beta's own (24 Oct)
  run: 'M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z',
  route: 'M19 15.18V7c0-2.21-1.79-4-4-4s-4 1.79-4 4v10c0 1.1-.9 2-2 2s-2-.9-2-2V8.82C8.16 8.4 9 7.3 9 6c0-1.66-1.34-3-3-3S3 4.34 3 6c0 1.3.84 2.4 2 2.82V17c0 2.21 1.79 4 4 4s4-1.79 4-4V7c0-1.1.9-2 2-2s2 .9 2 2v8.18c-1.16.41-2 1.51-2 2.82 0 1.66 1.34 3 3 3s3-1.34 3-3c0-1.3-.84-2.4-2-2.82z',
  school: 'M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z',
  sync: 'M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z',
  watch: 'M20 12c0-2.54-1.19-4.81-3.04-6.27L16 0H8l-.95 5.73C5.19 7.19 4 9.45 4 12s1.19 4.81 3.05 6.27L8 24h8l.96-5.73C18.81 16.81 20 14.54 20 12zM6 12c0-3.31 2.69-6 6-6s6 2.69 6 6-2.69 6-6 6-6-2.69-6-6z',
  play: 'M8 5v14l11-7z',
  blood: 'M12 2c-5.33 4.55-8 8.48-8 11.8 0 4.98 3.8 8.2 8 8.2s8-3.22 8-8.2c0-3.32-2.67-7.25-8-11.8z',
  food: 'M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z',
  pause: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z',
  // the core IMS services' own (24 Oct)
  calendar: 'M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z',
  cake: 'M12 6c1.11 0 2-.9 2-2 0-.38-.1-.73-.29-1.03L12 0l-1.71 2.97c-.19.3-.29.65-.29 1.03 0 1.1.9 2 2 2zm4.6 9.99l-1.07-1.07-1.08 1.07c-1.3 1.3-3.58 1.31-4.89 0l-1.07-1.07-1.09 1.07C6.75 16.64 5.88 17 4.96 17c-.73 0-1.4-.23-1.96-.61V21c0 .55.45 1 1 1h16c.55 0 1-.45 1-1v-4.61c-.56.38-1.23.61-1.96.61-.92 0-1.79-.36-2.44-1.01zM18 9h-5V7h-2v2H6c-1.66 0-3 1.34-3 3v1.54c0 1.08.88 1.96 1.96 1.96.52 0 1.02-.2 1.38-.57l2.14-2.13 2.13 2.13c.74.74 2.03.74 2.77 0l2.14-2.13 2.13 2.13c.37.37.86.57 1.38.57 1.08 0 1.96-.88 1.96-1.96V12C21 10.34 19.66 9 18 9z',
  mic: 'M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z',
  checklist: 'M22 7h-9v2h9V7zm0 8h-9v2h9v-2zM5.54 11L2 7.46l1.41-1.41 2.12 2.12 4.24-4.24 1.41 1.41L5.54 11zm0 8L2 15.46l1.41-1.41 2.12 2.12 4.24-4.24 1.41 1.41L5.54 19z',
  cloud: 'M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z',
  bulb: 'M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z',
  clipboard: 'M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z',
  alarm: 'M22 5.72l-4.6-3.86-1.29 1.53 4.6 3.86L22 5.72zM7.88 3.39L6.6 1.86 2 5.71l1.29 1.53 4.59-3.85zM12.5 8H11v6l4.75 2.85.75-1.23-4-2.37V8zM12 4c-4.97 0-9 4.03-9 9s4.02 9 9 9c4.97 0 9-4.03 9-9s-4.03-9-9-9zm0 16c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z',
  archive: 'M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z',
  camera: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9z',
  stop: 'M6 6h12v12H6z',
  place: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
  doorbell: 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z',
  list: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z',
  cup: 'M3 2l2.01 18.23C5.13 21.23 5.97 22 7 22h10c1.03 0 1.87-.77 1.99-1.77L21 2H3zm9 17c-1.66 0-3-1.34-3-3 0-2 3-5.4 3-5.4s3 3.39 3 5.4c0 1.66-1.34 3-3 3zm6.33-11H5.67l-.44-4h13.53l-.43 4z',
  terrain: 'M14 6l-3.75 5 2.85 3.8-1.6 1.2C9.81 13.75 7 10 7 10l-6 8h22L14 6z',
  timer: 'M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42C16.07 4.74 14.12 4 12 4c-4.97 0-9 4.03-9 9s4.02 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z',
  phone: 'M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z',
  flag: 'M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z',
  explore: 'M12 10.9c-.61 0-1.1.49-1.1 1.1s.49 1.1 1.1 1.1c.61 0 1.1-.49 1.1-1.1s-.49-1.1-1.1-1.1zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm2.19 12.19L6 18l3.81-8.19L18 6l-3.81 8.19z',
  search: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
  close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
  more: 'M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
  fav: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
  favo: 'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z',
  add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  remove: 'M19 13H5v-2h14v2z',
  book: 'M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z',
  flask: 'M19.8 18.4L14 10.67V6.5l1.35-1.69c.26-.33.03-.81-.39-.81H9.04c-.42 0-.65.48-.39.81L10 6.5v4.17L4.2 18.4c-.49.66-.02 1.6.8 1.6h14c.82 0 1.29-.94.8-1.6z',
  tune: 'M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z',
  share: 'M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z',
  print: 'M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z',
  bell: 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z',
  check: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  chart: 'M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z',
  leaf: 'M6.05 8.05a7.007 7.007 0 0 0-.02 9.88c1.47-3.4 4.09-6.24 7.36-7.93A15.952 15.952 0 0 0 8 19.32c2.6 1.23 5.8.78 7.95-1.37C19.43 14.47 20 4 20 4S9.53 4.57 6.05 8.05z',
  doc: 'M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
  download: 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z',
  send: 'M2.01 21L23 12 2.01 3 2 10l15 2-15 2z',
  star: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
  drop: 'M7 10l5 5 5-5z',
  up: 'M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z',
  down: 'M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z',
  edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
  del: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  person: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  blank: 'M0 0', // nothing: keeps menu items lined up beside one with a tick
  calc: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5.97 4.06L14.09 6l1.41 1.41L16.91 6l1.06 1.06-1.41 1.41 1.41 1.41-1.06 1.06-1.41-1.4-1.41 1.41-1.06-1.06 1.41-1.41-1.41-1.42zm-6.78.66h5v1.5h-5v-1.5zM11.5 16h-2v2H8v-2H6v-1.5h2v-2h1.5v2h2V16zm6.5 1.25h-5v-1.5h5v1.5zm0-2.5h-5v-1.5h5v1.5z',
  palette: 'M12 3a9 9 0 0 0 0 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
  image: 'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z',
  link: 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z',
  linkoff: 'M17 7h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1 0 1.43-.98 2.63-2.31 2.98l1.46 1.46C20.88 15.61 22 13.95 22 12c0-2.76-2.24-5-5-5zm-1 4h-2.19l2 2H16v-2zM2 4.27l3.11 3.11A4.991 4.991 0 0 0 2 12c0 2.76 2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1 0-1.59 1.21-2.9 2.76-3.07L8.73 11H8v2h2.73L13 15.27V17h1.73l4.01 4L20 19.74 3.27 3 2 4.27z',
  copy: 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z',
  wine: 'M6 3l0 6c0 2.97 2.16 5.43 5 5.91V19H8v2h8v-2h-3v-4.09c2.84-.48 5-2.94 5-5.91V3H6zm10 5H8V5h8v3z',
  sparkle: 'M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z',
  wand: 'M7.5 5.6L10 7 8.6 4.5 10 2 7.5 3.4 5 2l1.4 2.5L5 7zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5zm-7.63 5.29a.996.996 0 0 0-1.41 0L1.29 18.96a.996.996 0 0 0 0 1.41l2.34 2.34c.39.39 1.02.39 1.41 0L16.7 11.05a.996.996 0 0 0 0-1.41l-2.33-2.35zm-1.03 5.49l-2.12-2.12 2.44-2.44 2.12 2.12-2.44 2.44z',
  copyrecipe: 'M19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z',
  sort: 'M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z',
  upload: 'M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z',
  sun: 'M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z',
  moon: 'M9.37 5.51A7.35 7.35 0 0 0 9.1 7.5c0 4.08 3.32 7.4 7.4 7.4.68 0 1.35-.09 1.99-.27A7.014 7.014 0 0 1 12 19c-3.86 0-7-3.14-7-7 0-2.93 1.81-5.45 4.37-6.49zM12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z',
  home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
  info: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
  open: 'M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z',
  thermo: 'M15 13V5c0-1.66-1.34-3-3-3S9 3.34 9 5v8c-1.21.91-2 2.37-2 4 0 2.76 2.24 5 5 5s5-2.24 5-5c0-1.63-.79-3.09-2-4zm-4-8c0-.55.45-1 1-1s1 .45 1 1h-1v1h1v2h-1v1h1v2h-2V5z',
  note: 'M3 18h12v-2H3v2zM3 6v2h18V6H3zm0 7h18v-2H3v2z',
  admin: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
  merge: 'M17 20.41L18.41 19 15 15.59 13.59 17 17 20.41zM7.5 8H11v5.59L5.59 19 7 20.41l6-6V8h3.5L12 3.5 7.5 8z',
  boxon:'M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
  boxoff: 'M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z',
  radioon: 'M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z',
  radiooff: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z',
  paste: 'M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z',
  eye: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z',
  face: 'M9 11.75a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5zm6 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8 0-.29.02-.58.05-.86 2.36-1.05 4.230-2.98 5.21-5.37C11.07 8.33 14.05 10 17.42 10c.78 0 1.53-.09 2.25-.26.21.71.33 1.47.33 2.260 0 4.41-3.59 8-8 8z',
  monitor: 'M20 3H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h6v2H8v2h8v-2h-2v-2h6c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 13H4V5h16v11z',
  video: 'M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z',
  bolt: 'M11 21h-1l1-7H7.5c-.88 0-.33-.75-.31-.78C8.48 10.94 10.42 7.54 13.01 3h1l-1 7h3.51c.4 0 .62.19.4.66C12.97 17.55 11 21 11 21z',
  people: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  shield: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z',
  chat: 'M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z',
  rss: 'M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19 7.38 20 6.18 20 5 20 4 19 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z',
  public: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
  warn: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
  news: 'M22 3l-1.67 1.67L18.67 3 17 4.67 15.33 3l-1.66 1.67L12 3l-1.67 1.67L8.67 3 7 4.67 5.33 3 3.67 4.67 2 3v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V3zM11 19H4v-6h7v6zm9 0h-7v-2h7v2zm0-4h-7v-2h7v2zm0-4H4V8h16v3z',
  wifi: 'M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z',
  music: 'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z',
  dice: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM7.5 18c-.83 0-1.5-.67-1.5-1.5S6.67 15 7.5 15s1.5.67 1.5 1.5S8.33 18 7.5 18zm0-9C6.67 9 6 8.33 6 7.5S6.67 6 7.5 6 9 6.67 9 7.5 8.33 9 7.5 9zm4.5 4.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4.5 4.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm0-9c-.83 0-1.5-.67-1.5-1.5S15.67 6 16.5 6s1.5.67 1.5 1.5S17.33 9 16.5 9z',
  code: 'M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z',
  money: 'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z',
  disk: 'M2 20h20v-4H2v4zm2-3h2v2H4v-2zM2 4v4h20V4H2zm4 3H4V5h2v2zm-4 7h20v-4H2v4zm2-3h2v2H4v-2z',
  hub: 'M17 16l-4-4V8.82C14.16 8.4 15 7.3 15 6c0-1.66-1.34-3-3-3S9 4.34 9 6c0 1.3.84 2.4 2 2.82V12l-4 4H3v5h5v-3.05l4-4.2 4 4.2V21h5v-5h-4z',
  lock: 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z',
};
export function Icon({ n, size, className = '' }) {
  return (
    <svg className={`ic fill-current ${size ? `s${size}` : ''} ${className}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={P[n] || P.info} />
    </svg>
  );
}

// ---- media / motion hooks ----
export function useMedia(q) {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q).matches : false);
  const [m, setM] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [q]);
  return m;
}
export const useReducedMotion = () => useMedia('(prefers-reduced-motion: reduce)');

// true once (and while) the element is on screen - ambient animation pauses when it isn't
export function useInView(ref, { once = false, margin = '120px' } = {}) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) { setSeen(true); return undefined; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setSeen(true); if (once) io.disconnect(); } else if (!once) setSeen(false);
    }, { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, once, margin]);
  return seen;
}

// a number counting up to its value when first shown
export function useCountUp(to, { decimals = 0, ms = 650, from } = {}) {
  const reduced = useReducedMotion();
  const [v, setV] = useState(to);
  const prev = useRef(from ?? null);
  useEffect(() => {
    if (to == null || Number.isNaN(Number(to))) { setV(to); return undefined; }
    const start = prev.current == null ? (from ?? 0) : prev.current;
    prev.current = Number(to);
    if (reduced || start === Number(to)) { setV(Number(to)); return undefined; }
    let raf;
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms), k = 1 - Math.pow(1 - t, 3);
      setV(start + (Number(to) - start) * k);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to]); // eslint-disable-line react-hooks/exhaustive-deps
  return v == null || Number.isNaN(Number(v)) ? v : Number(v).toFixed(decimals);
}

// scrolled past the top (for the tinted top bar) and the scroll direction (for the FAB tucking away)
export function useScrollState(ref) {
  const [st, setSt] = useState({ lifted: false, down: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let last = el.scrollTop, raf = 0;
    const on = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = el.scrollTop;
        setSt((s) => {
          const lifted = y > 4;
          const down = y > last + 2 && y > 48 ? true : y < last - 2 ? false : s.down;
          last = y;
          return lifted === s.lifted && down === s.down ? s : { lifted, down };
        });
      });
    };
    el.addEventListener('scroll', on, { passive: true });
    return () => { el.removeEventListener('scroll', on); cancelAnimationFrame(raf); };
  }, [ref]);
  return st;
}

// Material press feedback: a ripple from where you touched, on anything with class "sl"
export function useRipples(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const down = (e) => {
      const t = e.target.closest?.('.sl');
      if (!t || !root.contains(t) || t.disabled) return;
      const r = t.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * 2.2;
      const dot = document.createElement('span');
      dot.className = 'ripple';
      dot.style.width = dot.style.height = `${size}px`;
      dot.style.left = `${e.clientX - r.left - size / 2}px`;
      dot.style.top = `${e.clientY - r.top - size / 2}px`;
      t.appendChild(dot);
      const a = dot.animate([{ transform: 'scale(0)', opacity: 0.18 }, { transform: 'scale(1)', opacity: 0 }], { duration: reduced ? 150 : 450, easing: 'cubic-bezier(.2,0,0,1)' });
      a.onfinish = () => dot.remove();
    };
    root.addEventListener('pointerdown', down);
    return () => root.removeEventListener('pointerdown', down);
  }, [rootRef]);
}

// ---- screen changes: the View Transitions API (Chrome on Android); an instant change where it isn't supported ----
// from: the element the vessel starts in (a card's art, or the page's hero); to(): finds where it ends up once the
// screen has changed - the two are morphed into each other (Material's container transform).
let vtRunning = null;
// ---- the liquid wipe (23 Oct, trial): moving between the main screens, a wave of amber brew spills across the screen
// - a wobbly, dripping front edge, a lit surface and a few bubbles - the screen changes while it's fully covered, then
// the liquid runs off the far side. dir 1 flows left to right (to a tab further along), -1 the other way. Off with
// Reduce motion. Drawn fresh for the screen's size each time.
let wiping = null;
// colours: the liquid's top, middle and bottom (Homebrew's amber unless given; the Run planner beta pours green)
export function liquidWipe(swap, { dir = 1, colours = ['#f7c25c', '#e7a03a', '#c8711a'] } = {}) {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !document.body.animate) { swap(); return; }
  if (wiping) { wiping(); }
  const W = window.innerWidth, H = window.innerHeight;
  const A = Math.max(36, Math.min(80, W * 0.09)); // how far the edges wobble
  // With the browser's page transitions (Chrome, so Android and the Play app): the new screen is built first, behind a
  // picture of the old one, and the old picture is cut away just behind the liquid's front edge as it sweeps across - the
  // page changes exactly as the liquid passes, never after it (23 Oct, Simon). Without them: the liquid is made wider,
  // so it covers the whole screen for a moment, and the screen changes then.
  const VT = typeof document.startViewTransition === 'function';
  const SW = Math.round(VT ? W * 1.15 + A * 4 : W * 2.2 + A * 4);
  // an edge as a wave down the screen, with a couple of drips bulging ahead of it
  const edge = (x0, phase, drips) => {
    const pts = [];
    for (let y = 0; y <= H; y += 12) {
      let x = x0 + A * 0.45 * Math.sin(y / 70 + phase) + A * 0.25 * Math.sin(y / 23 + phase * 2);
      for (const [dy, size] of drips) x += size * Math.exp(-(((y - dy * H) / 26) ** 2));
      pts.push([x, y]);
    }
    return pts;
  };
  const lead = edge(SW - A * 1.2, 0.6, [[0.28, A * 0.7], [0.66, A * 0.95]]);
  const trail = edge(A * 1.2, 2.1, [[0.45, -A * 0.5]]).reverse();
  const outline = `M${lead.map(([x, y]) => `${x.toFixed(1)} ${y}`).join(' L')} L${trail.map(([x, y]) => `${x.toFixed(1)} ${y}`).join(' L')} Z`;
  const shine = `M${lead.map(([x, y]) => `${(x - 7).toFixed(1)} ${y}`).join(' L')}`;
  const bubbles = Array.from({ length: 14 }, (_, i) => {
    const x = A * 2 + ((i * 97) % 89) / 89 * (W - A);
    const y = ((i * 53) % 97) / 97 * H;
    const r = 3 + (i % 4) * 2.5;
    return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r}" fill="#fff" fill-opacity=".18" stroke="#fff" stroke-opacity=".55" stroke-width="1.4"/>`;
  }).join('');
  const box = document.createElement('div');
  box.className = 'hbb-wipe';
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText = `position:fixed;inset:0;z-index:2147483000;pointer-events:none;overflow:hidden;transform:scaleX(${dir < 0 ? -1 : 1});`;
  // role="img": a drawing - IMS's page-wide icon rule would otherwise empty its fills
  box.innerHTML = `<div style="position:absolute;top:0;left:0;width:${SW}px;height:${H}px;will-change:transform,opacity"><svg role="img" width="${SW}" height="${H}" viewBox="0 0 ${SW} ${H}" style="display:block;overflow:visible;filter:drop-shadow(0 0 18px rgba(60,30,5,.35))">
    <defs><linearGradient id="hbbWipeG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${colours[0]}"/><stop offset=".55" stop-color="${colours[1]}"/><stop offset="1" stop-color="${colours[2]}"/></linearGradient>
    <linearGradient id="hbbWipeL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".18"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset=".92" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity=".05"/></linearGradient></defs>
    <path d="${outline}" fill="url(#hbbWipeG)"/><path d="${outline}" fill="url(#hbbWipeL)"/>
    <path d="${shine}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="4" stroke-linecap="round"/>${bubbles}</svg></div>`;
  // (the plain layer around the drawing is what moves and fades: it runs on the graphics compositor, so it keeps
  // going smoothly while the new screen is being built)
  const layer = box.firstElementChild;
  const html = document.documentElement;
  // one sweep at a steady speed: from off the near side, across, and off the far side, without stopping. The screen
  // changes the moment the liquid covers it all, which leaves about a third of a second, still covered, for the new
  // screen to be built; from halfway the liquid fades away quickly as it runs off
  const start = -SW, end = W, DURATION = 675; // (23 Oct: 25% quicker than 900)
  const coverAt = (W - SW + A * 2.4 - start) / (end - start); // when its front edge has passed the far side of the screen
  let done = false;
  const finish = () => { if (done) return; done = true; box.remove(); html.classList.remove('hbb-liquid'); if (wiping === finish) wiping = null; };
  let swapped = false;
  const doSwap = () => { if (!swapped) { swapped = true; swap(); } };
  wiping = () => { doSwap(); finish(); };
  const run = () => {
    const sweep = layer.animate([{ transform: `translateX(${start}px)` }, { transform: `translateX(${end}px)` }], { duration: DURATION, easing: 'linear', fill: 'forwards' });
    // the fade: from halfway, twice as quick (23 Oct) - gone three-quarters of the way through
    layer.animate([{ opacity: 1 }, { opacity: 1, offset: 0.5 }, { opacity: 0, offset: 0.75 }, { opacity: 0 }], { duration: DURATION, easing: 'linear', fill: 'forwards' });
    return sweep;
  };
  if (VT) {
    // the liquid is its own layer of the transition, drawn over both pictures and moving live
    box.style.viewTransitionName = 'hbb-liquid';
    html.classList.add('hbb-liquid');
    const vt = document.startViewTransition(() => { doSwap(); document.body.appendChild(box); });
    vt.ready.then(() => {
      run();
      // the old screen's picture, cut away from the side the liquid comes from, a little behind its front edge
      const cut = (tx) => Math.round(tx + SW - A * 2.2);
      const clip = (x) => (dir < 0 ? `inset(0 ${x}px 0 0)` : `inset(0 0 0 ${x}px)`);
      html.animate([{ clipPath: clip(cut(start)) }, { clipPath: clip(cut(end)) }], { duration: DURATION, easing: 'linear', fill: 'forwards', pseudoElement: '::view-transition-old(root)' });
    }).catch(finish);
    vt.finished.finally(finish);
    setTimeout(finish, 3000); // never left on screen
    return;
  }
  document.body.appendChild(box);
  const sweep = run();
  setTimeout(doSwap, DURATION * coverAt + 16);
  sweep.onfinish = () => { doSwap(); finish(); };
  setTimeout(() => { doSwap(); finish(); }, 3000); // never left on screen
}

export function viewTransition(update, { back = false, from = null, to = null } = {}) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduced) { update(); return; }
  if (vtRunning) { try { vtRunning.skipTransition(); } catch (_) { /* already done */ } }
  const html = document.documentElement;
  html.classList.add('hbb-vt');
  html.classList.toggle('hbb-back', back);
  if (from && from.isConnected) from.style.viewTransitionName = 'hbb-art';
  let landed = null;
  const vt = document.startViewTransition(() => {
    if (from) from.style.viewTransitionName = '';
    update();
    landed = from && to ? to() : null;
    if (landed) landed.style.viewTransitionName = 'hbb-art';
  });
  vtRunning = vt;
  vt.finished.finally(() => {
    if (landed) landed.style.viewTransitionName = '';
    html.classList.remove('hbb-vt', 'hbb-back');
    if (vtRunning === vt) vtRunning = null;
  });
}

// ---- buttons ----
export const IconButton = React.forwardRef(function IconButton({ icon, label, onClick, on, disabled, className = '', children, ...rest }, ref) {
  return (
    <button ref={ref} type="button" className={`ib sl ${on ? 'on' : ''} ${className}`} onClick={onClick} disabled={disabled} aria-label={label} title={label} {...rest}>
      {children || <Icon n={icon} />}
    </button>
  );
});
export function Btn({ kind = 'filled', icon, children, className = '', big, wide, busy, ...rest }) {
  return (
    <button type="button" className={`btn sl ${kind} ${icon || busy ? 'icon' : ''} ${big ? 'big' : ''} ${wide ? 'wide' : ''} ${className}`} {...rest}>
      {busy ? <Spinner size={18} /> : icon ? <Icon n={icon} /> : null}
      {children}
    </button>
  );
}
export function Spinner({ size = 24, label = 'Working' }) {
  return (
    <svg className="spin" width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={label} style={{ width: size, height: size }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
// Save that answers back: the label gives way to a spinner, then a tick and "Saved"
export function SaveButton({ onSave, label = 'Save', doneLabel = 'Saved', disabled, big = true, wide, className = '' }) {
  const [state, setState] = useState('idle');
  const go = async () => {
    if (state !== 'idle') return;
    setState('busy');
    try {
      const ok = await onSave();
      if (ok === false) { setState('idle'); return; }
      setState('done');
      setTimeout(() => setState('idle'), 1500);
    } catch { setState('idle'); }
  };
  return (
    <button type="button" className={`btn sl ${state === 'done' ? 'done' : 'filled'} icon ${big ? 'big' : ''} ${wide ? 'wide' : ''} ${className}`} onClick={go} disabled={disabled || state === 'busy'} aria-live="polite">
      {state === 'busy' ? <Spinner size={18} label="Saving" /> : state === 'done' ? <span className="tick-in" style={{ display: 'inline-flex' }}><Icon n="check" /></span> : <Icon n="check" />}
      {state === 'done' ? doneLabel : label}
    </button>
  );
}

// ---- chips ----
export function FilterChip({ on, onClick, children, count, lead }) {
  return (
    <button type="button" className={`chip sl ${on ? 'on' : ''}`} onClick={onClick} aria-pressed={Boolean(on)}>
      <span className="ck"><Icon n="check" size={18} /></span>
      {lead && <span className="em">{lead}</span>}
      {children}
      {count != null && <span className="n num">{count}</span>}
    </button>
  );
}
export function MenuChip({ on, onClick, children, label }) {
  return (
    <button type="button" className={`chip sl ${on ? 'on' : ''}`} onClick={onClick} aria-haspopup="dialog" aria-label={label}>
      {children}
      <span className="trail"><Icon n="drop" size={18} /></span>
    </button>
  );
}

// ---- text fields (outlined) ----
let fid = 0;
const useFid = (id) => useRef(id || `hbbf${++fid}`).current;
export function TextField({ label, value, onChange, type = 'text', help, id, className = '', inputMode, step, style, ...rest }) {
  const fieldId = useFid(id);
  return (
    <div className={`tf ${className}`} style={style}>
      <input id={fieldId} type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder=" " inputMode={inputMode} step={step} {...rest} />
      <label htmlFor={fieldId}>{label}</label>
      {help && <span className="help">{help}</span>}
    </div>
  );
}
export function TextArea({ label, value, onChange, rows = 3, help, id, className = '', style, ...rest }) {
  const fieldId = useFid(id);
  return (
    <div className={`tf ${className}`} style={style}>
      <textarea id={fieldId} rows={rows} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder=" " {...rest} />
      <label htmlFor={fieldId}>{label}</label>
      {help && <span className="help">{help}</span>}
    </div>
  );
}
export function SelectField({ label, value, onChange, options, help, id, className = '' }) {
  const fieldId = useFid(id);
  return (
    <div className={`tf ${className}`}>
      <select id={fieldId} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>))}
      </select>
      <label htmlFor={fieldId}>{label}</label>
      <span className="drop"><Icon n="drop" /></span>
      {help && <span className="help">{help}</span>}
    </div>
  );
}
export function Segmented({ value, onChange, options, label }) {
  return (
    <div className="segb" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={`sl ${value === v ? 'on' : ''}`} onClick={() => onChange(v)}>
          <span className="ck"><Icon n="check" size={18} /></span>{l}
        </button>
      ))}
    </div>
  );
}
export function Slider({ label, value, onChange, min, max, step = 1, lo, hi, id }) {
  const fieldId = useFid(id);
  return (
    <div className="slider">
      <div className="top"><label htmlFor={fieldId}>{label}</label><b className="num">{value}{max ? ` / ${max}` : ''}</b></div>
      <input id={fieldId} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {(lo || hi) && <div className="top t-bs muted"><span>{lo}</span><span>{hi}</span></div>}
    </div>
  );
}
// two-thumb range (strength)
export function RangeSlider({ min, max, value, onChange, label, unit = '%' }) {
  const [lo, hi] = value || [min, max];
  const pct = (v) => (max > min ? ((v - min) / (max - min)) * 100 : 0);
  return (
    <div className="slider">
      <div className="top"><span>{label}</span><b className="num">{lo}{unit} to {hi}{unit}</b></div>
      <div className="range2">
        <span className="rail2" />
        <span className="fill2" style={{ left: `calc(10px + (100% - 20px) * ${pct(lo) / 100})`, right: `calc(10px + (100% - 20px) * ${(100 - pct(hi)) / 100})` }} />
        <input type="range" min={min} max={max} step="0.5" value={lo} aria-label={`Lowest ${label}`} onChange={(e) => onChange([Math.min(Number(e.target.value), hi), hi])} />
        <input type="range" min={min} max={max} step="0.5" value={hi} aria-label={`Highest ${label}`} onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo)])} />
      </div>
    </div>
  );
}

// ---- tabs: the indicator slides to the chosen tab; the content slides in from the side you moved to ----
export function Tabs({ tabs, value, onChange }) {
  const box = useRef(null);
  const [ind, setInd] = useState({ x: 0, w: 0 });
  useLayoutEffect(() => {
    const el = box.current?.querySelector(`[data-v="${value}"] .tl2`);
    const tab = box.current?.querySelector(`[data-v="${value}"]`);
    if (el && tab) setInd({ x: tab.offsetLeft + el.offsetLeft - 4, w: el.offsetWidth + 8 });
  }, [value, tabs.length]);
  useEffect(() => {
    const on = () => {
      const el = box.current?.querySelector(`[data-v="${value}"] .tl2`);
      const tab = box.current?.querySelector(`[data-v="${value}"]`);
      if (el && tab) setInd({ x: tab.offsetLeft + el.offsetLeft - 4, w: el.offsetWidth + 8 });
    };
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [value]);
  return (
    <div className="tabs" role="tablist" ref={box}>
      {tabs.map(([v, l, icon]) => (
        <button key={v} data-v={v} type="button" role="tab" aria-selected={value === v} className={`tab sl ${value === v ? 'on' : ''}`} onClick={() => onChange(v)}>
          <span className="tl2" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{icon && <Icon n={icon} size={18} />}{l}</span>
        </button>
      ))}
      <span className="ind" style={{ width: ind.w, transform: `translateX(${ind.x}px)` }} />
    </div>
  );
}
// remembers which way the tabs moved, for the shared-axis slide
export function useAxis(order, value) {
  const prev = useRef(value);
  const dir = order.indexOf(value) >= order.indexOf(prev.current) ? 'axis-next' : 'axis-prev';
  useEffect(() => { prev.current = value; }, [value]);
  return value === prev.current ? '' : dir;
}

// light or dark, for drawings that need to know (the vessels' glass)
export const DarkCtx = createContext(false);

// ---- overlays: they render inside the .hbb root so they pick up its theme ----
const LayerCtx = createContext(null);
export const LayerProvider = ({ root, children }) => <LayerCtx.Provider value={root}>{children}</LayerCtx.Provider>;
function Layer({ children }) {
  const root = useContext(LayerCtx);
  return root ? createPortal(children, root) : children;
}

// Escape closes the top overlay. Sheets and dialogs also add a history entry while open, so Android's back gesture
// closes them rather than leaving the page; one listener handles every overlay, and the steps back the beta takes
// itself (closing an overlay with its own button) are ignored, so closing one never closes another.
const openStack = [];
let selfPops = 0;
let popListening = false;
export const isOverlayPop = () => selfPops > 0 || openStack.some((t) => t.justPopped);
function listenForBack() {
  if (popListening) return;
  popListening = true;
  window.addEventListener('popstate', () => {
    if (selfPops > 0) { selfPops--; return; }
    const top = [...openStack].reverse().find((t) => t.history);
    if (top) { top.popped = true; top.close(); }
  }, true);
}
// A tap outside an open menu or dropdown closes it - and if the tap was on another dropdown (the next filter chip, the
// sort or account button), that one opens too, rather than the tap being used up just closing the first (23 Oct)
function closeAndPass(e, close) {
  const { clientX: x, clientY: y } = e;
  close();
  const under = document.elementsFromPoint(x, y).find((el) => !el.closest('.menu-catch, .popover, .menu'));
  const target = under?.closest('[aria-haspopup]');
  if (target) setTimeout(() => target.click(), 0);
}

function useOverlayClose(open, close, { history = true } = {}) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return undefined;
    const token = { history, popped: false, close: () => closeRef.current() };
    openStack.push(token);
    const onKey = (e) => { if (e.key === 'Escape' && openStack[openStack.length - 1] === token) { e.stopPropagation(); closeRef.current(); } };
    window.addEventListener('keydown', onKey);
    if (history) { listenForBack(); window.history.pushState({ ...(window.history.state || {}), hbbOverlay: openStack.length }, ''); }
    return () => {
      window.removeEventListener('keydown', onKey);
      openStack.splice(openStack.indexOf(token), 1);
      if (history && !token.popped && window.history.state?.hbbOverlay) { selfPops++; window.history.back(); }
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
}

// Bottom sheet (a centred dialog on a wide screen). Drag it down by the handle to dismiss.
// titleAfter: something that sits right beside the title (e.g. a copy-the-name button)
export function Sheet({ open, onClose, title, titleAfter, children, footer, actions, wideWidth }) {
  const [shown, setShown] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const sheet = useRef(null);
  useEffect(() => { if (open) { setShown(true); setLeaving(false); } else if (shown) setLeaving(true); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useOverlayClose(open, onClose);
  const drag = useRef(null);
  const onDown = (e) => {
    if (window.matchMedia('(min-width: 840px)').matches) return;
    drag.current = { y: e.clientY, dy: 0, t: performance.now() };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (sheet.current) sheet.current.style.animation = 'none';
  };
  const onMove = (e) => {
    if (!drag.current || !sheet.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    sheet.current.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !sheet.current) return;
    const fast = d.dy / Math.max(1, performance.now() - d.t) > 0.6;
    if (d.dy > 120 || (fast && d.dy > 30)) { onClose(); return; }
    const el = sheet.current;
    el.animate([{ transform: `translateY(${d.dy}px)` }, { transform: 'translateY(0)' }], { duration: 250, easing: 'cubic-bezier(.05,.7,.1,1)' }).onfinish = () => { el.style.transform = ''; };
  };
  if (!shown) return null;
  const finish = () => { if (leaving) { setShown(false); setLeaving(false); } };
  return (
    <Layer>
      <div className={`scrim ${leaving ? 'out' : ''}`} onClick={onClose} />
      <div ref={sheet} className={`sheet ${leaving ? 'out' : ''}`} role="dialog" aria-modal="true" aria-label={title} onAnimationEnd={(e) => { if (e.target === sheet.current) finish(); }}
        style={wideWidth ? { '--w': wideWidth } : undefined}>
        <div className="handle" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}><i /></div>
        <div className="hd">
          <h2 style={titleAfter ? { display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 } : undefined}>
            {titleAfter ? <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{title}</span> : title}{titleAfter}
          </h2>
          {actions}<IconButton icon="close" label="Close" onClick={onClose} />
        </div>
        <div className="bd">{children}</div>
        {footer && <div className="ft">{footer}</div>}
      </div>
    </Layer>
  );
}

// Confirm dialog - built into the page (no window.confirm)
export function Confirm({ open, title, body, okLabel = 'OK', danger, onOk, onClose }) {
  useOverlayClose(open, onClose);
  if (!open) return null;
  return (
    <Layer>
      <div className="scrim dialog-scrim" onClick={onClose} />
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {body && <p>{body}</p>}
        <div className="acts">
          <Btn kind="text" onClick={onClose}>Cancel</Btn>
          <Btn kind="text" className={danger ? 'danger' : ''} onClick={() => { onClose(); onOk(); }}>{okLabel}</Btn>
        </div>
      </div>
    </Layer>
  );
}

// Overflow menu, anchored to the button that opened it
export function Menu({ anchor, open, onClose, items }) {
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!open || !anchor) return;
    // opens towards the middle of the screen: from a button on the left it opens rightwards, near the bottom upwards
    const r = anchor.getBoundingClientRect();
    const fromLeft = r.left + r.width / 2 < window.innerWidth / 2;
    const below = window.innerHeight - r.bottom;
    const h = fromLeft ? { left: Math.max(8, r.left) } : { right: Math.max(8, window.innerWidth - r.right) };
    const v = below > 320 ? { top: r.bottom + 4 } : { bottom: Math.max(8, window.innerHeight - r.top + 4) };
    setPos({ ...h, ...v, origin: `${v.top != null ? 'top' : 'bottom'} ${fromLeft ? 'left' : 'right'}` });
  }, [open, anchor]);
  useOverlayClose(open, onClose, { history: false });
  if (!open || !pos) return null;
  return (
    <Layer>
      <div className="menu-catch" onClick={(e) => closeAndPass(e, onClose)} />
      <div className="menu" role="menu" style={{ top: pos.top, bottom: pos.bottom, left: pos.left, right: pos.right, transformOrigin: pos.origin }}>
        {items.filter(Boolean).map((it, i) => (it === '-' ? <hr key={i} /> : (
          <button key={i} type="button" role="menuitem" className={`sl ${it.danger ? 'danger' : ''} ${it.selected ? 'sel' : ''}`} disabled={it.disabled}
            onClick={() => { onClose(); it.onClick(); }}>
            {it.icon && <Icon n={it.icon} />}{it.label}
          </button>
        )))}
      </div>
    </Layer>
  );
}
// A dropdown anchored under the chip that opened it, holding any content (a filter's options); stays open while you pick
export function Popover({ anchor, open, onClose, children, label, width = 300 }) {
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      setPos({ top: r.bottom + 6, left, maxHeight: window.innerHeight - r.bottom - 22 });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, anchor, width]);
  useOverlayClose(open, onClose, { history: false });
  if (!open || !pos) return null;
  return (
    <Layer>
      <div className="menu-catch" onClick={(e) => closeAndPass(e, onClose)} />
      <div className="popover" role="dialog" aria-label={label} style={{ top: pos.top, left: pos.left, width, maxHeight: pos.maxHeight }}>{children}</div>
    </Layer>
  );
}
// one choice in a dropdown: a checkbox (pick several) or radio (pick one), its label and how many it would show
export function PickRow({ on, multi, onClick, children, count, lead }) {
  return (
    <button type="button" className={`prow sl ${on ? 'on' : ''}`} role={multi ? 'menuitemcheckbox' : 'menuitemradio'} aria-checked={Boolean(on)} onClick={onClick}>
      <Icon n={multi ? (on ? 'boxon' : 'boxoff') : (on ? 'radioon' : 'radiooff')} />
      {lead && <span className="em" aria-hidden="true">{lead}</span>}
      <span className="lbl">{children}</span>
      {count != null && <span className="n num">{count}</span>}
    </button>
  );
}

export function useMenu() {
  const [anchor, setAnchor] = useState(null);
  return { anchor, open: Boolean(anchor), show: (e) => setAnchor(e.currentTarget), close: () => setAnchor(null) };
}

// ---- snackbars: one at a time, with an optional action (Undo) ----
const SnackCtx = createContext(() => {});
export const useSnack = () => useContext(SnackCtx);
export function SnackHost({ children }) {
  const [snack, setSnack] = useState(null);
  const [out, setOut] = useState(false);
  const timer = useRef(0);
  const show = useCallback((msg, opts = {}) => {
    clearTimeout(timer.current);
    setOut(false);
    setSnack({ msg, ...opts, key: Date.now() });
    timer.current = setTimeout(() => setOut(true), opts.action ? 6000 : opts.error ? 5000 : 3200);
  }, []);
  return (
    <SnackCtx.Provider value={show}>
      {children}
      <div className="snacks" aria-live="polite">
        {snack && (
          <div key={snack.key} className={`snack ${snack.error ? 'err' : ''} ${out ? 'out' : ''}`} onAnimationEnd={() => { if (out) setSnack(null); }}>
            <span className="msg">{snack.msg}</span>
            {snack.action && <Btn kind="text" onClick={() => { setOut(true); snack.action.onClick(); }}>{snack.action.label}</Btn>}
          </div>
        )}
      </div>
    </SnackCtx.Provider>
  );
}

// ---- brewing words explained: dotted terms and abbreviations open a tip on tap or hover ----
const TipCtx = createContext(() => {});
export function TipHost({ children }) {
  const [tip, setTip] = useState(null);
  useEffect(() => {
    if (!tip) return undefined;
    const close = () => setTip(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [tip]);
  return (
    <TipCtx.Provider value={setTip}>
      {children}
      {tip && (
        <Layer>
          {/* a tapped tip closes with a tap anywhere; a hovered one closes when the pointer leaves the word */}
          {!tip.hover && <div className="menu-catch" onClick={() => setTip(null)} />}
          <div className="tip" role="tooltip" style={{ left: Math.min(tip.x, window.innerWidth - 336), top: tip.y, pointerEvents: tip.hover ? 'none' : undefined }}>
            <b>{tip.term}</b>{tip.meaning}
          </div>
        </Layer>
      )}
    </TipCtx.Provider>
  );
}
// hover with a mouse shows the meaning (and moving away hides it); a tap or Enter shows it until the next tap
function Term({ text, meaning }) {
  const setTip = useContext(TipCtx);
  const show = (e, hover) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ term: text, meaning, x: Math.max(16, r.left), y: r.bottom + 6, hover });
  };
  return (
    <span className="term" role="button" tabIndex={0} aria-label={`${text}: ${meaning}`}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') show(e, true); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') setTip((t) => (t?.hover && t.term === text ? null : t)); }}
      onClick={(e) => show(e, false)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(e, false); } }}>{text}</span>
  );
}
export function RichText({ text }) {
  const s = String(text ?? '');
  const marks = [
    ...glossMatches(s).map((g) => ({ index: g.index, length: g.length, meaning: g.meaning })),
    ...abbrMatches(s).map((a) => ({ index: a.index, length: a.key.length, meaning: ABBR[a.key] })),
  ].sort((a, b) => a.index - b.index || b.length - a.length);
  const parts = [];
  let at = 0;
  for (const m of marks) {
    if (m.index < at) continue;
    if (m.index > at) parts.push(s.slice(at, m.index));
    parts.push(<Term key={m.index} text={s.slice(m.index, m.index + m.length)} meaning={m.meaning} />);
    at = m.index + m.length;
  }
  if (at < s.length) parts.push(s.slice(at));
  return <>{parts}</>;
}
