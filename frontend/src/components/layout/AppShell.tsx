import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { resetMockData } from '@/api/mock/database';
import { useAuth, useCurrentUser } from '@/auth/AuthContext';
import { Avatar } from '@/components/ui/Avatar';
import { Button, IconButton, LinkButton } from '@/components/ui/Button';
import { RoleTag, Tag } from '@/components/ui/Tag';
import { config } from '@/config';
import { cx } from '@/lib/cx';
import { describeAccount } from '@/lib/roles';
import { Brand } from './Brand';
import { navigationFor } from './navigation';

export function AppShell() {
  const user = useCurrentUser();
  const { logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const items = navigationFor(user.role);
  const isAdmin = user.role === 'ADMIN';
  const isMock = config.apiMode === 'mock';

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  async function handleSignOut() {
    setSigningOut(true);
    await logout();
  }

  function handleResetMock() {
    resetMockData();
    window.location.reload();
  }

  const renderLinks = (className: string) =>
    items.map((item) => (
      <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => cx(className, isActive && 'is-active')}>
        {item.label}
      </NavLink>
    ));

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar__inner">
          <Brand />
          <nav className="nav" aria-label="Primary">
            {renderLinks('nav__link')}
          </nav>
          <div className="topbar__end">
            {isMock && (
              <Tag tone="violet" className="topbar__mock">
                Mock API
              </Tag>
            )}
            {isAdmin && (
              <LinkButton to="/transcript" variant="primary" size="sm" className="topbar__create">
                Create from Transcript
              </LinkButton>
            )}
            <div className="account">
              <Avatar name={user.name} id={user.id} size="sm" />
              <div className="account__text">
                <span className="account__name">{user.name}</span>
                <span className="account__role">{describeAccount(user)}</span>
              </div>
            </div>
            <Button size="sm" className="topbar__signout" onClick={handleSignOut} loading={signingOut}>
              Sign out
            </Button>
            <IconButton
              className="topbar__menu"
              label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            </IconButton>
          </div>
        </div>
        <div id="mobile-menu" className="mobile-menu" hidden={!menuOpen}>
          <nav className="mobile-menu__nav" aria-label="Primary, compact">
            {renderLinks('mobile-menu__link')}
          </nav>
          {isAdmin && (
            <LinkButton to="/transcript" variant="primary" block>
              Create from Transcript
            </LinkButton>
          )}
          <div className="mobile-menu__account">
            <Avatar name={user.name} id={user.id} size="sm" />
            <div className="account__text">
              <span className="account__name">{user.name}</span>
              <span className="account__role">{describeAccount(user)}</span>
            </div>
            <RoleTag role={user.role} />
          </div>
          <Button block onClick={handleSignOut} loading={signingOut}>
            Sign out
          </Button>
        </div>
      </header>

      <main id="main" className="main" tabIndex={-1}>
        <Outlet />
      </main>

      {isMock && (
        <footer className="mock-bar">
          <div className="mock-bar__inner">
            <p>Mock API mode. Data is stored in this browser and AI extraction is simulated.</p>
            <button type="button" className="text-button" onClick={handleResetMock}>
              Reset mock data
            </button>
          </div>
        </footer>
      )}
      <ScrollRestoration />
    </div>
  );
}
