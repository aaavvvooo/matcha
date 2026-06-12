"""social features: likes, views, connections, messages, notifications, blocks, reports

Revision ID: a1b2c3d4e5f6
Revises: 447011dacd74
Create Date: 2026-06-12 00:01:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '447011dacd74'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add columns to users
    op.add_column('users', sa.Column('is_online', sa.Boolean(), server_default='false', nullable=True))
    op.add_column('users', sa.Column('last_seen', sa.DateTime(timezone=True), nullable=True))

    # Add location columns to user_profiles
    op.add_column('user_profiles', sa.Column('latitude', sa.Float(), nullable=True))
    op.add_column('user_profiles', sa.Column('longitude', sa.Float(), nullable=True))
    op.add_column('user_profiles', sa.Column('location_label', sa.String(length=255), nullable=True))

    # likes
    op.create_table(
        'likes',
        sa.Column('liker_id', sa.Integer(), nullable=False),
        sa.Column('liked_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['liker_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['liked_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('liker_id', 'liked_id'),
    )

    # profile_views
    op.create_table(
        'profile_views',
        sa.Column('viewer_id', sa.Integer(), nullable=False),
        sa.Column('viewed_id', sa.Integer(), nullable=False),
        sa.Column('viewed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['viewer_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['viewed_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('viewer_id', 'viewed_id'),
    )

    # connections (mutual likes — user_a_id < user_b_id enforced by CHECK)
    op.create_table(
        'connections',
        sa.Column('user_a_id', sa.Integer(), nullable=False),
        sa.Column('user_b_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['user_a_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_b_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_a_id', 'user_b_id'),
        sa.CheckConstraint('user_a_id < user_b_id', name='ck_connections_ordered'),
    )

    # messages
    op.create_table(
        'messages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('sender_id', sa.Integer(), nullable=False),
        sa.Column('receiver_id', sa.Integer(), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('is_read', sa.Boolean(), server_default='false', nullable=True),
        sa.Column('sent_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['sender_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['receiver_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_messages_id'), 'messages', ['id'], unique=False)

    # notifications
    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('type', sa.String(length=50), nullable=False),
        sa.Column('from_user', sa.Integer(), nullable=True),
        sa.Column('is_read', sa.Boolean(), server_default='false', nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['from_user'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_notifications_id'), 'notifications', ['id'], unique=False)
    op.create_index(op.f('ix_notifications_user_id'), 'notifications', ['user_id'], unique=False)

    # blocks
    op.create_table(
        'blocks',
        sa.Column('blocker_id', sa.Integer(), nullable=False),
        sa.Column('blocked_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['blocker_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['blocked_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('blocker_id', 'blocked_id'),
    )

    # reports
    op.create_table(
        'reports',
        sa.Column('reporter_id', sa.Integer(), nullable=False),
        sa.Column('reported_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['reporter_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['reported_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('reporter_id', 'reported_id'),
    )


def downgrade() -> None:
    op.drop_table('reports')
    op.drop_table('blocks')
    op.drop_index(op.f('ix_notifications_user_id'), table_name='notifications')
    op.drop_index(op.f('ix_notifications_id'), table_name='notifications')
    op.drop_table('notifications')
    op.drop_index(op.f('ix_messages_id'), table_name='messages')
    op.drop_table('messages')
    op.drop_table('connections')
    op.drop_table('profile_views')
    op.drop_table('likes')
    op.drop_column('user_profiles', 'location_label')
    op.drop_column('user_profiles', 'longitude')
    op.drop_column('user_profiles', 'latitude')
    op.drop_column('users', 'last_seen')
    op.drop_column('users', 'is_online')
