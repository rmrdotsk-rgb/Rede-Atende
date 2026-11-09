import { PageLoading } from '../common/PageLoading';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Rede Atende - Layout do Cidadão / Comunidade Escolar
 */

import React, { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from '../common/Header';
import { Footer } from '../common/Footer';

export const CommunityLayout: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      <Header mode="community" />

      {/* Conteúdo Principal com Outlet */}
      <main
        className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"
        id="main-content"
        tabIndex={-1}
      >
        <Suspense fallback={<PageLoading />}>
          <Outlet />
        </Suspense>
      </main>

      <Footer />
    </div>
  );
};
