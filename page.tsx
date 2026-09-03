'use client';

import { useState } from 'react';

export default function Home() {
  const [channelUrl, setChannelUrl] = useState('');
  const [status, setStatus] = useState('');

  function iniciarAutomacao() {
    if (!channelUrl.trim()) {
      setStatus('Cole o link do canal do YouTube primeiro.');
      return;
    }

    if (
      !channelUrl.includes('youtube.com') &&
      !channelUrl.includes('youtu.be')
    ) {
      setStatus('Digite um link válido do YouTube.');
      return;
    }

    setStatus(
      'Canal cadastrado! Agora vamos conectar o processamento automático dos vídeos.'
    );
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#080b14',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        padding: '24px',
      }}
    >
      <div
        style={{
          maxWidth: '900px',
          margin: '0 auto',
        }}
      >
        <nav
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '70px',
          }}
        >
          <strong
            style={{
              fontSize: '26px',
              color: '#8b5cf6',
            }}
          >
            ClipIA
          </strong>

          <span
            style={{
              color: '#aaa',
              fontSize: '14px',
            }}
          >
            Vídeos automáticos com IA
          </span>
        </nav>

        <section
          style={{
            textAlign: 'center',
            marginBottom: '50px',
          }}
        >
          <div
            style={{
              display: 'inline-block',
              background: '#18112f',
              color: '#b99cff',
              padding: '8px 14px',
              borderRadius: '
