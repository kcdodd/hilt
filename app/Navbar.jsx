"use strict";

import http from 'axios';
import React from 'react';
import Radium from 'radium';
import * as Bootstrap from 'react-bootstrap';
import {log, subscribe} from 'journal';
import './css/bootstrap.css';

export default React.createClass({
  getInitialState: function(){
    return {
      user: {
        username: 'no user'
      }
    };
  },
  componentDidMount: function(){
    this.unsubscribe = subscribe(state => {
      this.setState(state)
    }, {
      user: './currentUser'
    });
  },
  componentWillUnmount: function(){
    this.unsubscribe();
  },
  register: function() {
    log({
      action: './register',
      data: {show: true}
    });
  },
  logout: function() {
    log({
      action: './logout',
      data: {}
    });
  },
  render: function() {

    return (
      <Bootstrap.Navbar>
        <Bootstrap.Navbar.Header>
          {(brand => {
            if (brand){
              if (brand.imageUrl) {return (
                <Bootstrap.Navbar.Brand>
                  <a href={brand.url}>
                    <img src={brand.imageUrl} alt={brand.name} style={{height: '100%'}}/>
                  </a>
                </Bootstrap.Navbar.Brand>
              );}

              return (
                <Bootstrap.Navbar.Brand>
                  <a href={brand.url}>
                    {brand.name}
                  </a>
                </Bootstrap.Navbar.Brand>
              );
            }
          })(this.props.brand)}
          <Bootstrap.Navbar.Toggle/>
        </Bootstrap.Navbar.Header>
        <Bootstrap.Navbar.Collapse>
          <Bootstrap.Nav>
            {this.props.links.map((link, index) => {
              return <Bootstrap.NavItem key={index} href={link.url}>{link.name}</Bootstrap.NavItem>;
            })}
          </Bootstrap.Nav>
          <Bootstrap.Nav pullRight>
            <Bootstrap.NavDropdown title={this.state.user.username} id="basic-nav-dropdown">
              {(() => {
                if (this.state.user._id && !this.state.user.guest) {
                  <Bootstrap.MenuItem onSelect={this.logout}>Logout</Bootstrap.MenuItem>
                }

                return <Bootstrap.MenuItem onSelect={this.register}>Register</Bootstrap.MenuItem>;
              })()}
            </Bootstrap.NavDropdown>
          </Bootstrap.Nav>
        </Bootstrap.Navbar.Collapse>
      </Bootstrap.Navbar>
    );
  }
});