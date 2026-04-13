import React from 'react'

export const Navbar: React.FC = () => {
  return (
    <div className="navbar">
      <div className="left">
        <div className="logo">TICKET FAIRY</div>
        <div className="nav-links">
          <span>Ticket Fairy Platform ▾</span>
          <span>Blog ▾</span>
          <span>Help</span>
        </div>
      </div>

      <div className="right">
        <span>Search</span>
        <span>My Account</span>
        <button className="btn-outline">Create Event</button>
      </div>
    </div>
  )
}
